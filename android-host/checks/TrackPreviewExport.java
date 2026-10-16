package dev.jamescullimore.tinyracers.spike;
import java.nio.file.*;
import java.util.Locale;
/** Export actual sampled routes for controller previews. Run from repository root. */
public class TrackPreviewExport {
 public static void main(String[] args)throws Exception{
  String[] descriptions={"Flowing · table edges","Twisty · garden bends","Hairpins · 2 shortcuts"};
  StringBuilder html=new StringBuilder();
  for(int theme=0;theme<3;theme++){
   Track t=new Track(theme);double scale=Math.min(260/(t.maxX-t.minX),110/(t.maxY-t.minY));
   double ox=150-(t.minX+t.maxX)/2*scale,oy=65-(t.minY+t.maxY)/2*scale;
   StringBuilder path=new StringBuilder();double turns=0,last=0;
   for(int i=0;i<=Track.COUNT;i+=4)path.append(String.format(Locale.ROOT,"%s%.2f %.2f ",i==0?"M":"L",ox+t.x[i]*scale,oy+t.y[i]*scale));
   for(int i=0;i<Track.COUNT;i++){double a=Math.atan2(t.y[i+1]-t.y[i],t.x[i+1]-t.x[i]);if(i>0)turns+=Math.abs(Math.atan2(Math.sin(a-last),Math.cos(a-last)));last=a;}
   html.append("<button data-track=\"").append(theme).append("\" aria-pressed=\"").append(theme==0).append("\" disabled><strong>").append(Track.NAMES[theme]).append("</strong><svg viewBox=\"0 0 300 130\" role=\"img\" aria-label=\"").append(Track.NAMES[theme]).append(" circuit outline\"><path d=\"").append(path).append("Z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"5\" stroke-linejoin=\"round\"/><circle cx=\"").append(ox+t.x[0]*scale).append("\" cy=\"").append(oy+t.y[0]*scale).append("\" r=\"6\" fill=\"#81e478\" stroke=\"#112b40\" stroke-width=\"2\"/></svg><small>").append(descriptions[theme]).append("</small></button>\n");
   int close=html.lastIndexOf("</svg>");
   StringBuilder cuts=new StringBuilder();
   for(Track.Shortcut cut:t.shortcuts)cuts.append(String.format(Locale.ROOT,"<path d=\"M%.2f %.2f L%.2f %.2f\" stroke=\"#61e2db\" stroke-width=\"2\"/>",ox+cut.x1*scale,oy+cut.y1*scale,ox+cut.x2*scale,oy+cut.y2*scale));
   html.insert(close,cuts);
   System.out.printf(Locale.ROOT,"%s: total turning %.0f degrees%n",Track.NAMES[theme],turns*180/Math.PI);
  }
  Path file=Path.of("spike/index.html");String s=Files.readString(file);int start=s.indexOf("<!-- track-previews:start -->"),end=s.indexOf("<!-- track-previews:end -->");
  if(start<0||end<0)throw new IllegalStateException("Preview markers missing");
  s=s.substring(0,start)+"<!-- track-previews:start -->\n"+html+s.substring(end);Files.writeString(file,s);
 }
}
