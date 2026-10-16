package dev.jamescullimore.tinyracers.spike;

import android.app.Activity;
import android.os.Bundle;
import android.os.SystemClock;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Bitmap;
import com.google.zxing.BarcodeFormat;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import java.net.InetSocketAddress;
import java.util.UUID;
import java.util.Collections;
import java.util.Arrays;
import android.net.Uri;
import org.json.JSONArray;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.java_websocket.drafts.Draft_6455;
import org.java_websocket.WebSocket;
import org.java_websocket.handshake.ClientHandshake;
import org.java_websocket.server.WebSocketServer;
import org.json.JSONObject;

/** Four-player host-authoritative lobby and independent steering lanes. */
public final class SpikeActivity extends Activity {
    private volatile Host server;
    private volatile String status = "Starting WebSocket server…";
    private static final int[] COLORS = { Color.rgb(186,250,98), Color.rgb(100,202,255), Color.rgb(255,165,98), Color.rgb(216,155,255) };
    private final Player[] players = new Player[4];
    private static final class Player {
        final int slot;
        int character;
        boolean autoItems=true;
        final String resume = UUID.randomUUID().toString();
        WebSocket socket;
        boolean ready;
        boolean synthetic;
        boolean driving;
        double input;
        long lastInput, disconnectedAt, sequence = -1, sessionPackets, firstInput, previousInput;
        final long[] gaps = new long[256];
        int gapCount, gapCursor;
        Player(int slot) { this.slot = slot; this.character = slot; }
        void attach(WebSocket next) {
            socket = next; ready = false; driving = false; input = 0; lastInput = 0; sequence = -1;
            sessionPackets = firstInput = previousInput = 0; gapCount = gapCursor = 0;
        }
        boolean connected() { return socket != null && socket.isOpen(); }
        boolean stale(long now) { return !connected() || lastInput == 0 || now - lastInput >= 250; }
    }
    private final ExecutorService lifecycle = Executors.newSingleThreadExecutor();
    private int selectedTrack=0,selectedLaps=1,selectedBots=0;
    private final boolean[] raceBots=new boolean[4];
    private final Track.Point botAim=new Track.Point();
    private final Track[] previewTracks={new Track(0),new Track(1),new Track(2)};
    private final String token = UUID.randomUUID().toString().substring(0, 8);
    private Bitmap pairingQr;
    private RaceModel race;
    private GameAudio audio;
    private UiStrings strings;
    private final int[] raceCharacters = new int[4];
    private String controllerOrigin = "";
    private String relayOrigin = "";
    private final String relaySecret = RelayClient.newSecret();
    private final String relayRoom = RelayClient.roomForSecret(relaySecret);
    private volatile RelayClient relay;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        String origin = getIntent().getStringExtra("controllerOrigin");
        if (origin == null && !BuildConfig.RELAY_ORIGIN.isEmpty()) origin = BuildConfig.RELAY_ORIGIN;
        if (origin != null && origin.matches("https://[a-z0-9-]+\\.[a-z0-9-]+\\.workers\\.dev")) relayOrigin = origin;
        if (origin != null && (!relayOrigin.isEmpty() || origin.matches("https://(?:[0-9.]+:8443|[a-z0-9-]+\\.trycloudflare\\.com)"))) {
            controllerOrigin = origin;
            try {
                BitMatrix qr = new QRCodeWriter().encode(origin + "/#token=" + (relayOrigin.isEmpty()?token:relayRoom), BarcodeFormat.QR_CODE, 232, 232);
                pairingQr = Bitmap.createBitmap(qr.getWidth(), qr.getHeight(), Bitmap.Config.ARGB_8888);
                for (int y = 0; y < qr.getHeight(); y++) for (int x = 0; x < qr.getWidth(); x++)
                    pairingQr.setPixel(x, y, qr.get(x, y) ? Color.BLACK : Color.WHITE);
            } catch (Exception ignored) { pairingQr = null; }
        }
        android.util.Log.i("TinyRacers", "Pairing token: " + token);
        if (!relayOrigin.isEmpty()) android.util.Log.i("TinyRacers", "Hosted room: " + relayRoom);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().getDecorView().setSystemUiVisibility(5894);
        strings=new UiStrings(this);audio=new GameAudio(this,strings);setVolumeControlStream(android.media.AudioManager.STREAM_MUSIC);
        setContentView(new Preview());
    }
    @Override public void onStart() {
        super.onStart();
        Host next = new Host(); server = next;
        lifecycle.execute(() -> {
            if (server != next) return;
            next.setReuseAddr(true); next.setConnectionLostTimeout(3); next.start();
        });
    }
    @Override public void onStop() {
        RelayClient oldRelay = relay; relay = null; if (oldRelay != null) oldRelay.close();
        Host old = server; server = null;
        synchronized (players) { Arrays.fill(players, null); race = null; }
        if (old != null) lifecycle.execute(() -> { try { old.stop(500); } catch (Exception ignored) {} });
        super.onStop();
    }
    @Override public void onResume(){super.onResume();if(audio!=null)audio.resume();}
    @Override public void onPause(){if(audio!=null)audio.pause();super.onPause();}
    @Override public void onDestroy() { if(audio!=null)audio.close();lifecycle.shutdown(); super.onDestroy(); }
    @Override public boolean onKeyDown(int code, KeyEvent event) {
        if((code==KeyEvent.KEYCODE_DPAD_LEFT||code==KeyEvent.KEYCODE_DPAD_RIGHT)&&race==null){
            synchronized(players){selectedTrack=(selectedTrack+(code==KeyEvent.KEYCODE_DPAD_RIGHT?1:2))%3;for(Player player:players)if(player!=null)player.ready=false;}
            Host host=server;if(host!=null)host.broadcastLobby();return true;
        }
        if(code==KeyEvent.KEYCODE_MENU){if(race!=null&&!race.complete()){race.pausedBy=race.pausedBy>=0?-1:4;}else audio.settings();return true;}
        if (code == KeyEvent.KEYCODE_DPAD_CENTER) {
            synchronized (players) {
                if (race != null) returnToLobby(); else startRace();
            }
            Host host = server; if (host != null) host.broadcastLobby();
            return true;
        }
        return super.onKeyDown(code, event);
    }

    private void startRace() {
        if (race != null) return;
        boolean[] joined = new boolean[4]; int count = 0;
        for (Player p : players) if (p != null && p.connected()) {
            if (!p.ready || !p.driving || p.stale(SystemClock.elapsedRealtime())) return;
            joined[p.slot] = true; raceCharacters[p.slot] = p.character; count++;
        }
        if(count==0)return;
        Arrays.fill(raceBots,false);
        int bots=selectedBots;
        for(int i=0;i<4&&bots>0;i++)if(players[i]==null){joined[i]=true;raceBots[i]=true;raceCharacters[i]=i;bots--;}
        race = new RaceModel(joined,System.nanoTime(),selectedTrack,selectedLaps);
    }
    private void returnToLobby() {
        race = null;
        Arrays.fill(raceBots,false);
        for (Player p : players) if (p != null) p.ready = false;
    }

    private final class Host extends WebSocketServer {
        Host() { super(new InetSocketAddress("127.0.0.1", 8765), 1,
            Collections.singletonList(new Draft_6455(Collections.emptyList(), 512))); }
        Player find(WebSocket socket) {
            for (Player p : players) if (p != null && p.socket == socket) return p;
            return null;
        }
        void broadcastLobby() {
            synchronized (players) {
                try {
                    JSONArray list = new JSONArray(); int connected = 0, ready = 0;
                    int vacant=0;for(Player p:players)if(p==null)vacant++;
                    if(race==null)selectedBots=Math.min(selectedBots,vacant);
                    long now = SystemClock.elapsedRealtime();
                    for (Player p : players) if (p != null) {
                        if (p.connected()) { connected++; if (p.ready && p.driving && !p.stale(now)) ready++; }
                        list.put(new JSONObject().put("id", p.slot + 1).put("connected", p.connected())
                            .put("autoItems",p.autoItems).put("character", p.character).put("name", RaceArt.NAMES[p.character]).put("ready", p.ready).put("synthetic", p.synthetic).put("stale", p.stale(now)));
                    }
                    JSONObject state = new JSONObject().put("v", 1).put("type", "lobby")
                        .put("language",strings.language()).put("bots",selectedBots).put("laps",selectedLaps).put("track",selectedTrack).put("trackName",Track.NAMES[selectedTrack]).put("players", list).put("allReady", connected >= 1 && ready == connected);
                    if (race != null) {
                        JSONArray cars = new JSONArray();
                        for (int i = 0; i < 4; i++) if (race.cars[i] != null) {
                            RaceModel.Car c = race.cars[i];
                            Track.Point aim = new Track.Point(); race.aim(c, aim);
                            cars.put(new JSONObject().put("id", i + 1).put("bot",raceBots[i]).put("x", c.x).put("y", c.y)
                                .put("heading", c.heading).put("place", c.place).put("aimX",aim.x).put("aimY",aim.y).put("progress",c.progress).put("health",c.health).put("falling",c.fallTime>0).put("spinning",c.spinTimer>0).put("grabbed",c.grabbedBy>=0).put("airborne",c.airborne()).put("height",c.height()).put("attack",c.attackTime>0).put("attackType",c.attackType).put("jumps",c.jumps).put("knockouts",c.knockouts)
                                .put("points", c.points).put("eliminated", c.place<0).put("danger", c.danger).put("power", c.power).put("powerName", RaceModel.POWER_NAMES[c.power]));
                        }
                        state.put("race", new JSONObject().put("pausedBy",race.pausedBy+1).put("track",race.track.theme).put("trackName",Track.NAMES[race.track.theme]).put("countdown", race.countdown).put("elapsed", race.elapsed)
                            .put("round",race.round).put("roundBreak",race.roundBreak).put("roundWinner",race.roundWinner+1).put("courseProgress",race.courseProgress).put("courseLength",race.raceDistance()).put("lapLength",race.track.length).put("laps",race.laps).put("lap",race.currentLap()).put("zoom",race.zoom).put("complete", race.complete()).put("cars", cars));
                    }
                    for (Player p : players) if (p != null && p.connected()) p.socket.send(state.toString());
                } catch (Exception ignored) { /* Closing peers are removed by onClose. */ }
            }
        }
        @Override public void onOpen(WebSocket socket, ClientHandshake handshake) {
            synchronized (players) {
                if (server != this) { socket.close(); return; }
                Uri uri = Uri.parse(handshake.getResourceDescriptor());
                String resume = uri.getQueryParameter("resume");
                if (!"/input".equals(uri.getPath()) || !token.equals(uri.getQueryParameter("token")) ||
                    !handshake.getFieldValue("Origin").equals("http://localhost:8080") ||
                    (resume != null && !resume.matches("[0-9a-f-]{36}"))) {
                    socket.close(1008, "Check TV token"); return;
                }
                long now = SystemClock.elapsedRealtime();
                Player selected = null;
                for (int i = 0; i < players.length; i++) {
                    Player p = players[i];
                    if (race == null && p != null && !p.connected() && now - p.disconnectedAt > 60000) players[i] = null;
                    else if (p != null && p.resume.equals(resume)) selected = p;
                }
                if (selected != null && selected.connected()) { socket.close(1008, "Player already connected"); return; }
                if (selected == null && race != null) { socket.close(1008, "Race in progress; join the next lobby"); return; }
                if (selected == null) for (int i = 0; i < players.length; i++) if (players[i] == null) {
                    selected = new Player(i); players[i] = selected; break;
                }
                if (selected == null) { socket.close(1008, "Lobby full; disconnected slots held for 60 seconds"); return; }
                selected.attach(socket);
                try {
                    socket.send(new JSONObject().put("v", 1).put("type", "welcome")
                        .put("playerId", selected.slot + 1).put("resume", selected.resume).toString());
                } catch (Exception error) { socket.close(1011, "Join failed"); }
                status = "Join, calibrate, then mark ready"; broadcastLobby();
            }
        }
        @Override public void onClose(WebSocket socket, int code, String reason, boolean remote) {
            synchronized (players) {
                if (server != this) return;
                Player p = find(socket);
                if (p != null) {
                    if(race!=null&&race.pausedBy==p.slot)race.pausedBy=-1;
                    p.socket = null; p.input = 0; p.lastInput = 0; p.ready = false;
                    p.disconnectedAt = SystemClock.elapsedRealtime(); broadcastLobby();
                }
            }
        }
        @Override public void onMessage(WebSocket socket, String message) {
            synchronized (players) {
                Player p = find(socket);
                if (p == null || server != this) return;
                try {
                    if (message.length() > 512) throw new IllegalArgumentException();
                    JSONObject data = new JSONObject(message);
                    if (!(data.get("v") instanceof Number) || data.getDouble("v") != 1) throw new IllegalArgumentException();
                    String type = data.getString("type");
                    long now = SystemClock.elapsedRealtime();
                    if(type.equals("pause")){if(race!=null&&!race.complete()&&race.pausedBy<0)race.pausedBy=p.slot;broadcastLobby();return;}
                    if(type.equals("resume")){if(race!=null&&(race.pausedBy==p.slot||race.pausedBy==4))race.pausedBy=-1;broadcastLobby();return;}
                    if(type.equals("autoItems")){if(!(data.get("enabled") instanceof Boolean))throw new IllegalArgumentException();p.autoItems=data.getBoolean("enabled");broadcastLobby();return;}
                    if(type.equals("language")){
                        Object choice=data.get("language");
                        if(!(choice instanceof String)||!java.util.Arrays.asList(UiStrings.CODES).contains(choice))throw new IllegalArgumentException();
                        strings.setLanguage((String)choice);broadcastLobby();return;
                    }
                    if(type.equals("bots")){
                        Object choice=data.get("bots");int value=data.getInt("bots");
                        if(!(choice instanceof Number)||data.getDouble("bots")!=value||value<0||value>3)throw new IllegalArgumentException();
                        if(race==null&&selectedBots!=value){selectedBots=value;for(Player player:players)if(player!=null)player.ready=false;broadcastLobby();}return;
                    }
                    if(type.equals("laps")){
                        Object choice=data.get("laps");int value=data.getInt("laps");
                        if(!(choice instanceof Number)||data.getDouble("laps")!=value||value<1||value>3)throw new IllegalArgumentException();
                        if(race==null&&selectedLaps!=value){selectedLaps=value;for(Player player:players)if(player!=null)player.ready=false;broadcastLobby();}return;
                    }
                    if(type.equals("track")){
                        Object choice=data.get("track");int value=data.getInt("track");
                        if(!(choice instanceof Number)||data.getDouble("track")!=value||value<0||value>2)throw new IllegalArgumentException();
                        if(race==null&&selectedTrack!=value){selectedTrack=value;for(Player player:players)if(player!=null)player.ready=false;broadcastLobby();}return;
                    }
                    if (type.equals("start")) { startRace(); broadcastLobby(); return; }
                    if (type.equals("use")) {
                        if(race!=null && race.pausedBy<0 && p.driving && !p.stale(now))race.usePower(p.slot);
                        broadcastLobby();return;
                    }
                    if (type.equals("lobby")) { returnToLobby(); broadcastLobby(); return; }
                    if (type.equals("character")) {
                        Object choice = data.get("character");
                        if (!(choice instanceof Number) || data.getDouble("character") != data.getInt("character") || data.getInt("character") < 0 || data.getInt("character") > 3) throw new IllegalArgumentException();
                        if (race == null) { p.character = data.getInt("character"); p.ready = false; broadcastLobby(); }
                        return;
                    }
                    if (type.equals("ready")) {
                        if (!(data.get("ready") instanceof Boolean)) throw new IllegalArgumentException();
                        p.ready = data.getBoolean("ready"); broadcastLobby(); return;
                    }
                    if (type.equals("leave")) {
                        if(race!=null&&race.pausedBy==p.slot)race.pausedBy=-1;
                        if (race != null) race.leave(p.slot);
                        players[p.slot] = null; socket.close(1000, "Left lobby"); broadcastLobby(); return;
                    }
                    if (type.equals("ping")) {
                        if (!(data.get("id") instanceof Number)) throw new IllegalArgumentException();
                        long id = data.getLong("id");
                        if (id < 0 || id > 9007199254740991L || data.getDouble("id") != id) throw new IllegalArgumentException();
                        long[] sorted = Arrays.copyOf(p.gaps, p.gapCount); Arrays.sort(sorted);
                        JSONObject host = new JSONObject().put("packets", p.sessionPackets)
                            .put("playerId", p.slot + 1).put("stale", p.stale(now)).put("steering", p.stale(now) ? 0 : p.input)
                            .put("lastSequence", p.sequence).put("inputAgeMs", p.lastInput == 0 ? -1 : now - p.lastInput)
                            .put("arrivalHz", p.sessionPackets < 2 || now == p.firstInput ? 0 : (p.sessionPackets - 1) * 1000.0 / (now - p.firstInput))
                            .put("p95ArrivalGapMs", p.gapCount == 0 ? -1 : sorted[(int)Math.ceil(p.gapCount * .95) - 1]);
                        socket.send(new JSONObject().put("v", 1).put("type", "pong").put("id", id).put("host", host).toString()); return;
                    }
                    if (!type.equals("input")) throw new IllegalArgumentException();
                    if (data.has("synthetic") && !(data.get("synthetic") instanceof Boolean)) throw new IllegalArgumentException();
                    if (data.has("active") && !(data.get("active") instanceof Boolean)) throw new IllegalArgumentException();
                    if (!(data.get("seq") instanceof Number) || !(data.get("steering") instanceof Number)) throw new IllegalArgumentException();
                    double rawSeq = data.getDouble("seq"); long next = data.getLong("seq");
                    double value = data.getDouble("steering");
                    if (rawSeq != next || next < 0 || next > 9007199254740991L || !Double.isFinite(value) || Math.abs(value) > 1) throw new IllegalArgumentException();
                    if (next <= p.sequence) return;
                    p.synthetic |= data.optBoolean("synthetic", false);
                    p.driving = data.optBoolean("active", true);
                    if (p.sessionPackets == 0) p.firstInput = now;
                    else { p.gaps[p.gapCursor] = now - p.previousInput; p.gapCursor = (p.gapCursor + 1) % p.gaps.length; p.gapCount = Math.min(p.gapCount + 1, p.gaps.length); }
                    p.previousInput = now; p.sessionPackets++;
                    p.sequence = next; p.input = value; p.lastInput = now;
                } catch (Exception error) { socket.close(1008, "Invalid v1 input"); }
            }
        }
        @Override public void onError(WebSocket socket, Exception error) { if (server == this) status = "Socket error: " + error.getClass().getSimpleName(); }
        @Override public void onStart() {
            runOnUiThread(() -> {
                if (server != this) return;
                status = "Listening on port 8765";
                if (!relayOrigin.isEmpty()) {
                    relay = new RelayClient(relayOrigin, relaySecret, relayRoom, token); relay.start();
                }
            });
        }
    }

    private final class Preview extends View {
        final RaceArt art = new RaceArt(SpikeActivity.this,strings);
        final double[] inputs = new double[4];
        final boolean[] active = new boolean[4];
        long previous, sentState;
        Preview() { super(SpikeActivity.this); setFocusable(true); }
        @Override protected void onDraw(Canvas canvas) {
            long now = SystemClock.elapsedRealtime();
            synchronized (players) {
                if (race != null) {
                    Arrays.fill(inputs,0); Arrays.fill(active,false);
                    for (Player p : players) if (p != null) { race.autoUse[p.slot]=p.autoItems; inputs[p.slot]=p.input; active[p.slot]=p.driving && !p.stale(now); }
                    boolean humanActive=false;for(int i=0;i<4;i++)if(!raceBots[i]&&active[i])humanActive=true;
                    for(int i=0;i<4;i++)if(raceBots[i]){
                        inputs[i]=race.botSteering(i,botAim);
                        active[i]=humanActive;race.autoUse[i]=true;
                    }
                    race.step(previous==0?0:(now-previous)/1000.0,inputs,active);
                }
                if (now-sentState>=250) { Host h=server; if(h!=null)h.broadcastLobby();sentState=now; }
                previous=now;
                canvas.drawColor(RaceArt.NAVY);canvas.save();
                float scale=Math.min(getWidth()/1280f,getHeight()/720f);
                canvas.translate((getWidth()-1280*scale)/2,(getHeight()-720*scale)/2);canvas.scale(scale,scale);
                audio.tick(race);
                if(race==null) drawLobby(canvas,now); else drawRace(canvas,now);
                canvas.restore();
            }
            postInvalidateOnAnimation();
        }
        void drawLobby(Canvas c,long now) {
            art.stars(c);
            art.text(c,"TINY RACERS · CHOOSE YOUR ADVENTURE",48,37,20,RaceArt.CREAM,true);
            for(int theme=0;theme<3;theme++)drawTrackPreview(c,theme,48+theme*282,50,266,125);
            art.text(c,strings.t(Track.NAMES[selectedTrack])+" · "+strings.t(selectedLaps+(selectedLaps==1?" lap":" laps"))+" · "+strings.t("CHOOSE ON YOUR PHONE"),48,194,16,RaceArt.GOLD,true);
            int connected=0,ready=0,botsRemaining=selectedBots;
            for(int i=0;i<4;i++) {
                Player p=players[i];boolean live=p!=null&&p.connected();int character=p==null?i:p.character;
                boolean bot=p==null&&botsRemaining>0;if(bot)botsRemaining--;
                if(live){connected++;if(p.ready&&p.driving&&!p.stale(now))ready++;}
                float x=48+i*211;
                art.rect(c,x,215,x+194,578,22,RaceArt.PANEL);
                art.rect(c,x+15,231,x+179,235,2,COLORS[i]);
                art.text(c,(bot?strings.t("BOT"):"P"+(i+1))+(p!=null&&p.synthetic?" · TEST":""),x+19,264,15,COLORS[i],true);
                float portraitHeight=character<2?173:211;
                art.portrait(c,character,x+97,494-portraitHeight,portraitHeight);
                art.centre(c,RaceArt.NAMES[character],x+97,528,25,RaceArt.CREAM,true);
                art.centreFit(c,172,bot?"BOT":p==null?"Join the adventure":!live?"Reconnecting…":p.ready?"READY TO RACE":"Choose & calibrate",x+97,557,13,p!=null&&p.ready?COLORS[i]:RaceArt.MUTED,false);
            }
            art.rect(c,913,170,1232,578,24,0xff203f53);
            art.centreFit(c,285,"YOUR PHONE = YOUR WHEEL",1072,209,16,RaceArt.GOLD,true);
            if(pairingQr!=null){art.box.set(956,230,1188,462);c.drawBitmap(pairingQr,null,art.box,null);}
            art.centre(c,"Scan to join",1072,494,25,RaceArt.CREAM,true);
            art.centreFit(c,285,relayOrigin.isEmpty()?"Room code  "+token:relay!=null&&relay.connected?"ONLINE":"Connecting…",1072,528,18,RaceArt.GOLD,true);
            art.centreFit(c,285,relayOrigin.isEmpty()?"Same Wi-Fi · Motion controls":"Internet · Motion controls",1072,557,13,RaceArt.MUTED,false);
            art.rect(c,48,606,1232,672,18,RaceArt.GOLD);
            String prompt=connected>=1&&ready==connected?"ALL READY!  Start on your phone or press OK":"SCAN  →  CHOOSE  →  READY  →  HOLD STRAIGHT";
            art.centreFit(c,1130,prompt,640,647,24,RaceArt.NAVY,true);
            art.text(c,strings.t(Track.NAMES[selectedTrack])+" · "+strings.t(selectedLaps+(selectedLaps==1?" lap":" laps"))+" · "+strings.t(connected+" / 4 PLAYERS · MENU: SOUND"),49,699,14,RaceArt.MUTED,true);
            art.text(c,controllerOrigin,927,699,13,RaceArt.MUTED,false);
        }
        void drawTrackPreview(Canvas c,int theme,float x,float y,float w,float h){
            Track t=previewTracks[theme];boolean selected=theme==selectedTrack;
            art.rect(c,x,y,x+w,y+h,14,selected?0xff425646:RaceArt.PANEL);
            art.text(c,Track.NAMES[theme],x+12,y+23,17,selected?RaceArt.GOLD:RaceArt.CREAM,true);
            art.text(c,new String[]{"Flowing · table edges","Twisty · garden bends","Hairpins · 2 shortcuts"}[theme],x+12,y+h-9,12,RaceArt.MUTED,false);
            float scale=(float)Math.min((w-32)/(t.maxX-t.minX),(h-59)/(t.maxY-t.minY));
            float ox=x+w/2-(float)(t.minX+t.maxX)/2*scale,oy=y+31+(h-59)/2-(float)(t.minY+t.maxY)/2*scale;
            android.graphics.Path path=new android.graphics.Path();
            for(int i=0;i<=Track.COUNT;i+=4){float px=ox+(float)t.x[i]*scale,py=oy+(float)t.y[i]*scale;if(i==0)path.moveTo(px,py);else path.lineTo(px,py);}path.close();
            art.p.setStyle(android.graphics.Paint.Style.STROKE);art.p.setStrokeWidth(4);art.p.setColor(selected?RaceArt.GOLD:RaceArt.CREAM);c.drawPath(path,art.p);art.p.setStyle(android.graphics.Paint.Style.FILL);
            art.p.setStrokeWidth(2);art.p.setColor(0xff61e2db);
            for(Track.Shortcut cut:t.shortcuts)c.drawLine(ox+(float)cut.x1*scale,oy+(float)cut.y1*scale,ox+(float)cut.x2*scale,oy+(float)cut.y2*scale,art.p);
            art.p.setColor(0xffa5ed79);c.drawCircle(ox+(float)t.x[0]*scale,oy+(float)t.y[0]*scale,5,art.p);
        }
        void drawRace(Canvas c,long now) {
            c.drawColor(0xffba936b);
            c.save();c.clipRect(0,0,1280,720);
            c.translate(640,360);c.scale((float)race.zoom,(float)race.zoom);
            c.translate(-(float)race.cameraX,-(float)race.cameraY);
            art.drawCourse(c,race);
            for(int i=0;i<race.pickupWait.length;i++)if(race.pickupWait[i]==0)art.pickup(c,(float)race.pickupX(i),(float)race.pickupY(i));
            for(RaceModel.Hazard hazard:race.hazards)if(hazard!=null)art.hazard(c,hazard);
            for(int layer=0;layer<2;layer++)for(int i=0;i<4;i++) {
                RaceModel.Car car=race.cars[i];if(car==null||(car.airborne()?1:0)!=layer)continue;Player p=players[i];
                if(car.place==0||car.fallTime>0)art.kart(c,car,raceCharacters[i],COLORS[i],i+1,!raceBots[i]&&(p==null||!p.driving||p.stale(now)));
            }
            for(RaceModel.Car car:race.cars)if(car!=null&&car.place==0)art.attack(c,car);
            c.restore();
            // Edge bursts remain visible even after the eliminated car leaves the viewport.
            for(int i=0;i<4;i++) {
                RaceModel.Car car=race.cars[i];if(car==null)continue;
                float sx=(float)(640+(car.x-race.cameraX)*race.zoom),sy=(float)(360+(car.y-race.cameraY)*race.zoom);
                sx=Math.max(38,Math.min(1242,sx));sy=Math.max(28,Math.min(650,sy));
                if(car.explosion>0){
                    for(int j=0;j<10;j++){double angle=j*Math.PI/5;float radius=(float)(20+65*(1-car.explosion));
                        art.rect(c,sx+(float)Math.cos(angle)*radius-5,sy+(float)Math.sin(angle)*radius-5,sx+(float)Math.cos(angle)*radius+5,sy+(float)Math.sin(angle)*radius+5,3,j%2==0?RaceArt.GOLD:COLORS[i]);}
                    art.centre(c,"P"+(i+1)+" OUT!",sx,sy,22,RaceArt.CREAM,true);
                }
            }
            for(int i=0;i<4;i++) {
                RaceModel.Car car=race.cars[i];if(car==null)continue;float x=18+i*316;
                art.rect(c,x,668,x+292,710,14,0xb3112437);
                art.portrait(c,raceCharacters[i],x+24,672,34);
                art.text(c,(raceBots[i]?strings.t("BOT"):"P"+(i+1))+" "+RaceArt.NAMES[raceCharacters[i]],x+49,695,17,COLORS[i],true);
                art.text(c,car.points+" ★",x+233,696,20,RaceArt.GOLD,true);
            }
            if(race.countdown>0){
                art.rect(c,530,267,750,410,22,RaceArt.NAVY);
                art.centre(c,"GET READY",640,300,18,RaceArt.CREAM,true);
                art.centre(c,""+(int)Math.ceil(race.countdown),640,384,72,RaceArt.GOLD,true);
            } else if(race.roundBreak>0&&!race.complete()) {
                art.rect(c,320,260,960,418,22,RaceArt.NAVY);
                art.centreFit(c,595,race.roundWinner>=0?RaceArt.NAMES[raceCharacters[race.roundWinner]]+" SCORES +1":"ROUND PAUSED",640,321,34,RaceArt.GOLD,true);
                art.centreFit(c,595,race.roundBreak<=.001?"Waiting for active racers":"Everyone returns for the next round",640,375,22,RaceArt.CREAM,true);
            }
            if(race.complete()) drawResults(c);
            if(race.pausedBy>=0){
                art.rect(c,410,285,870,407,24,0xe6112437);
                art.centre(c,race.pausedBy==4?"PAUSED":"PLAYER "+(race.pausedBy+1)+" PAUSED",640,337,30,RaceArt.GOLD,true);
                art.centreFit(c,420,"Resume on the controller",640,377,18,RaceArt.CREAM,false);
            }
        }
        void drawResults(Canvas c) {
            c.drawColor(0xcd102335);
            art.centre(c,"ONE MORE RACE BEFORE BED?",640,125,19,RaceArt.GOLD,true);
            art.centre(c,"Final standings",640,180,52,RaceArt.CREAM,true);
            art.centre(c,"Points first · Distance breaks ties · Then knockouts",640,213,16,RaceArt.MUTED,false);
            int column=0;
            int finishers=0;
            for(RaceModel.Car car:race.cars) if(car!=null)finishers++;
            for(int place=1;place<=4;place++)for(int i=0;i<4;i++) {
                RaceModel.Car car=race.cars[i];if(car==null||car.place!=place)continue;
                int character=raceCharacters[i];
                float x=(1280-finishers*235+20)/2f+column++*235;
                art.rect(c,x,235,x+215,558,22,place==1?0xff37566a:RaceArt.PANEL);
                art.centre(c,place==1?"#1 · WINNER":"#"+place,x+107,273,23,place==1?RaceArt.GOLD:RaceArt.MUTED,true);
                art.portrait(c,character,x+107,285,180);
                art.centre(c,RaceArt.NAMES[character]+(raceBots[i]?" · "+strings.t("BOT"):""),x+107,500,26,RaceArt.CREAM,true);
                art.centreFit(c,194,"Points: "+car.points+" · KOs: "+car.knockouts,x+107,533,18,RaceArt.MUTED,false);
            }
            art.rect(c,365,594,915,654,17,RaceArt.GOLD);
            art.centreFit(c,510,"Back to lobby on your phone · Remote OK",640,631,21,RaceArt.NAVY,true);
        }
    }
}
