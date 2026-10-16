package dev.jamescullimore.tinyracers.spike;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import org.java_websocket.client.WebSocketClient;
import org.java_websocket.handshake.ServerHandshake;
import org.json.JSONObject;

/** Outbound TLS relay; local adapters retain the existing authoritative host protocol. */
final class RelayClient implements AutoCloseable {
    static String newSecret() { return UUID.randomUUID().toString().replace("-", "") + UUID.randomUUID().toString().replace("-", ""); }
    static String roomForSecret(String secret) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(secret.getBytes(StandardCharsets.UTF_8));
            StringBuilder room = new StringBuilder();
            for (int i=0;i<16;i++) room.append(String.format(java.util.Locale.ROOT,"%02x",digest[i]&255));
            return room.toString();
        } catch (Exception error) { throw new IllegalStateException(error); }
    }
    private final String origin, secret, room, localToken;
    private final ScheduledExecutorService retry = Executors.newSingleThreadScheduledExecutor();
    private final Map<String, WebSocketClient> peers = new HashMap<>();
    private WebSocketClient host;
    private boolean closed;
    volatile boolean connected;
    RelayClient(String origin, String secret, String room, String localToken) {
        this.origin=origin;this.secret=secret;this.room=room;this.localToken=localToken;
    }
    synchronized void start() {
        if(closed)return;
        Map<String,String> headers=new HashMap<>();headers.put("Authorization","Bearer "+secret);
        host=new WebSocketClient(URI.create(origin.replace("https://","wss://")+"/host?token="+room),headers) {
            @Override public void onOpen(ServerHandshake handshake) { setConnectionLostTimeout(10); }
            @Override public void onMessage(String text) {
                synchronized(RelayClient.this) {
                    if(closed||host!=this)return;
                    try {
                        if(text.length()>32768)throw new IllegalArgumentException();
                        JSONObject message=new JSONObject(text);
                        String type=message.getString("type");
                        if(type.equals("connected")){connected=true;return;}
                        String id=message.getString("id");
                        if(!id.matches("[0-9a-f-]{36}"))throw new IllegalArgumentException();
                        if(type.equals("open"))openPeer(id,message.optString("resume",""));
                        else if(type.equals("close")){WebSocketClient peer=peers.remove(id);if(peer!=null)peer.close();}
                        else if(type.equals("message")){
                            WebSocketClient peer=peers.get(id);String data=message.getString("data");
                            if(data.getBytes(StandardCharsets.UTF_8).length>512)throw new IllegalArgumentException();
                            if(peer!=null&&peer.isOpen())peer.send(data);
                        }
                    }catch(Exception error){close(1008,"Invalid relay envelope");}
                }
            }
            @Override public void onClose(int code,String reason,boolean remote) {
                synchronized(RelayClient.this) {
                    if(host!=this)return;
                    connected=false;closePeers();
                    if(!closed)retry.schedule(RelayClient.this::start,2,TimeUnit.SECONDS);
                }
            }
            @Override public void onError(Exception error) {
                android.util.Log.w("TinyRacers", "Relay connection: " + error.getClass().getSimpleName() + ": " + error.getMessage());
            }
        };
        host.setConnectionLostTimeout(10);host.connect();
    }
    private void openPeer(String id,String resume) {
        if(peers.containsKey(id)||peers.size()>=4){send("close",id,null,1008);return;}
        String path="ws://127.0.0.1:8765/input?token="+localToken;
        if(resume.matches("[0-9a-f-]{36}"))path+="&resume="+resume;
        Map<String,String> headers=new HashMap<>();headers.put("Origin","http://localhost:8080");
        WebSocketClient peer=new WebSocketClient(URI.create(path),headers) {
            @Override public void onOpen(ServerHandshake handshake) { setConnectionLostTimeout(10); }
            @Override public void onMessage(String text) { synchronized(RelayClient.this) {if(peers.get(id)==this)RelayClient.this.send("message",id,text,0);} }
            @Override public void onClose(int code,String reason,boolean remote) {
                synchronized(RelayClient.this) {if(peers.get(id)==this){peers.remove(id);RelayClient.this.send("close",id,null,code);}}
            }
            @Override public void onError(Exception error) { /* Handled by close. */ }
        };
        peers.put(id,peer);peer.connect();
    }
    private void send(String type,String id,String data,int code) {
        if(closed||host==null||!host.isOpen())return;
        try {
            JSONObject envelope=new JSONObject().put("type",type).put("id",id);
            if(data!=null)envelope.put("data",data);if(code!=0)envelope.put("code",code);
            host.send(envelope.toString());
        }catch(Exception ignored){}
    }
    private void closePeers(){WebSocketClient[] old=peers.values().toArray(new WebSocketClient[0]);peers.clear();for(WebSocketClient peer:old)peer.close();}
    @Override public synchronized void close(){closed=true;connected=false;retry.shutdownNow();closePeers();if(host!=null)host.close();}
}
