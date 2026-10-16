package dev.jamescullimore.tinyracers.spike;
import android.content.Context;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.regex.*;

/** Shared catalogue with the web controller; character names and diagnostics stay unchanged. */
final class UiStrings {
 static final String[] CODES={"en","de","fr","es","it","pt","nl","pl"};
 private final JSONObject catalog;
 private final Map<String,String> keys=new HashMap<>();
 private final Map<String,Pattern> patterns=new LinkedHashMap<>();
 private final android.content.SharedPreferences prefs;
 private volatile String language;
 private final android.util.LruCache<String,String> cache=new android.util.LruCache<>(512);
 UiStrings(Context context){
  prefs=context.getSharedPreferences("display",Context.MODE_PRIVATE);
  try(java.io.InputStream in=context.getAssets().open("player-ui.json")){
   java.io.ByteArrayOutputStream bytes=new java.io.ByteArrayOutputStream();byte[] buffer=new byte[4096];int read;while((read=in.read(buffer))!=-1)bytes.write(buffer,0,read);
   catalog=new JSONObject(new String(bytes.toByteArray(),StandardCharsets.UTF_8));
   Iterator<String> it=catalog.getJSONObject("en").keys();
   while(it.hasNext()){
    String key=it.next();keys.put(normal(key),key);
    if(key.matches(".*\\{\\d+\\}.*")){
     String[] parts=key.split("\\{\\d+\\}",-1);StringBuilder regex=new StringBuilder("^");
     for(int i=0;i<parts.length;i++){if(i>0)regex.append("(.+?)");regex.append(Pattern.quote(parts[i]));}
     patterns.put(key,Pattern.compile(regex.append('$').toString(),Pattern.CASE_INSENSITIVE));
    }
   }
  }catch(Exception e){throw new IllegalStateException("Missing UI translations",e);}
  language=resolve(prefs.getString("language",Locale.getDefault().getLanguage()));
 }
 static String resolve(String input){String code=input==null?"en":input.toLowerCase(Locale.ROOT).split("[-_]")[0];return Arrays.asList(CODES).contains(code)?code:"en";}
 String language(){return language;}
 void setLanguage(String code){language=resolve(code);prefs.edit().putString("language",language).apply();}
 private static String normal(String s){return s.replaceAll("\\s+"," ").trim().toLowerCase(Locale.ROOT);}
 String t(String source){
  String key=language+"\u0000"+source;String value=cache.get(key);if(value!=null)return value;
  value=lookup(source);cache.put(key,value);return value;
 }
 private String lookup(String source){
  JSONObject messages=catalog.optJSONObject(language);String key=keys.get(normal(source));
  if(key!=null)return messages.optString(key,source);
  for(Map.Entry<String,Pattern> entry:patterns.entrySet()){
   Matcher match=entry.getValue().matcher(source);
   if(match.matches()){String result=messages.optString(entry.getKey(),source);for(int n=1;n<=match.groupCount();n++)result=result.replace("{"+(n-1)+"}",match.group(n));return result;}
  }
  if(source.contains(" · ")){String[] parts=source.split(" · ");for(int i=0;i<parts.length;i++)parts[i]=t(parts[i]);return String.join(" · ",parts);}
  return source;
 }
}
