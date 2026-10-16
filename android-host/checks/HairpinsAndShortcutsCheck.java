package dev.jamescullimore.tinyracers.spike;
public class HairpinsAndShortcutsCheck{
 static void ok(boolean v,String m){if(!v)throw new AssertionError(m);}
 public static void main(String[] args){
  Track t=new Track(2);Track.Point p=new Track.Point();
  ok(t.hairpinBarriers.size()>20,"hairpin islands missing");ok(t.shortcuts.size()==2,"shortcuts missing");
  for(Track.Obstacle wall:t.hairpinBarriers){
   for(int i=0;i<Track.COUNT;i++){
    double dx=Math.max(0,Math.abs(t.x[i]-wall.x)-wall.halfW),dy=Math.max(0,Math.abs(t.y[i]-wall.y)-wall.halfH);
    ok(Math.hypot(dx,dy)>Track.HALF_WIDTH+12,"wall blocks road");
   }
  }
  for(Track.Shortcut cut:t.shortcuts){
   double saved=cut.end-cut.start-cut.length;System.out.printf("Shortcut saves %.1f world units (%.2fs at normal speed)%n",saved,saved/RaceModel.MAX_SPEED);
   ok(saved>15&&saved<200,"shortcut is not a modest corner cut");double previous=cut.start;
   for(int i=0;i<=100;i++){
    double u=i/100.;double x=cut.x1+(cut.x2-cut.x1)*u,y=cut.y1+(cut.y2-cut.y1)*u;t.nearest(x,y,p);
    ok(!t.outside(x,y,p),"shortcut falls through floor");ok(p.distance>=previous-1&&p.distance-previous<20,"shortcut progress jumps");previous=p.distance;
   }
  }
  for(boolean airborne:new boolean[]{false,true}){
   RaceModel r=new RaceModel(new boolean[]{true,true,false,false},42,2);r.countdown=0;
   Track.Obstacle wall=r.track.hairpinBarriers.get(4);RaceModel.Car c=r.cars[0];
   c.x=wall.x;c.y=wall.y-wall.halfH-21;c.heading=Math.PI/2;c.speed=210;
   r.track.nearest(c.x,c.y,p);c.progress=p.distance;if(airborne)c.jumpTime=1;
   for(int frame=0;frame<20;frame++)r.step(1./60,new double[4],new boolean[]{true,false,false,false});
   ok(c.y<=wall.y-wall.halfH-19,"racer crossed LEGO barrier, airborne="+airborne);
  }
  System.out.println("PASS three protected hairpins, clear driving lanes, ground/air collision and two continuous shortcuts.");
 }
}
