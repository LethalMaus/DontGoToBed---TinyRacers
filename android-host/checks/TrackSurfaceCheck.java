package dev.jamescullimore.tinyracers.spike;
public class TrackSurfaceCheck {
 static void ok(boolean v,String m){if(!v)throw new AssertionError(m);}
 public static void main(String[] args){
  Track.Point p=new Track.Point(),near=new Track.Point();
  for(int theme=0;theme<3;theme++){
   Track t=new Track(theme);
   for(int i=0;i<9600;i++){
    t.at(t.length*i/9600,p);
    for(double side:new double[]{-1,0,1}){
     double width=theme==0?Track.HALF_WIDTH+40:Track.TABLE_HALF_WIDTH-1;
     double x=p.x-Math.sin(p.heading)*width*side,y=p.y+Math.cos(p.heading)*width*side;
     t.nearest(x,y,near);ok(!t.outside(x,y,near),"Visible floor falls through: theme="+theme+" sample="+i+" side="+side);
    }
   }
   if(theme==0){double cx=(t.minX+t.maxX)/2,cy=(t.minY+t.maxY)/2,rx=(t.maxX-t.minX)/2,ry=(t.maxY-t.minY)/2;
    for(int i=0;i<360;i++){double a=i*Math.PI/180;
     double x=cx+Math.cos(a)*rx*1.001,y=cy+Math.sin(a)*ry*1.001;t.nearest(x,y,near);ok(t.outside(x,y,near),"Real table edge no longer falls");
    }
   }
  }
  System.out.println("PASS all three visible floor surfaces and Dining Table road/verge remain supported; true edge still falls.");
 }
}
