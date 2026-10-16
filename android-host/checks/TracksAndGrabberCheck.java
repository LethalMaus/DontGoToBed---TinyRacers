package dev.jamescullimore.tinyracers.spike;
public class TracksAndGrabberCheck {
 static final boolean[] ALL={true,true,true,true};static final Track.Point p=new Track.Point();
 static void ok(boolean v,String m){if(!v)throw new AssertionError(m);}
 static void place(RaceModel r,int i,double d,double lane){r.track.at(d,p);RaceModel.Car c=r.cars[i];c.x=p.x-Math.sin(p.heading)*lane;c.y=p.y+Math.cos(p.heading)*lane;c.heading=p.heading;c.progress=d;c.speed=0;}
 static double[] input(RaceModel r){double[] s=new double[4];for(int i=0;i<4;i++){RaceModel.Car c=r.cars[i];r.aim(c,p);s[i]=Math.max(-1,Math.min(1,RaceModel.wrap(Math.atan2(p.y-c.y,p.x-c.x)-c.heading)*2));}return s;}
 public static void main(String[]args){
  for(int theme=0;theme<3;theme++)for(int laps=1;laps<=3;laps++){
   RaceModel r=new RaceModel(ALL,42,theme,laps);r.countdown=0;
   for(int n=0;n<60*420*laps&&!r.complete();n++)r.step(1.0/60,input(r),ALL);
   ok(r.complete(),"course failed "+theme);ok(r.elapsed>120,"lap too short");
   ok(r.currentLap()==laps,"wrong final lap");
   ok(r.courseProgress>=r.track.length*laps,"finished before selected distance");
   System.out.printf("%s %d lap(s) %.1fs / %d rounds%n",Track.NAMES[theme],laps,r.elapsed,r.round);
  }
  RaceModel r=new RaceModel(ALL,42,0);r.countdown=0;
  for(int i=0;i<4;i++)place(r,i,1000+i*90,0);
  r.step(1.0/60,new double[4],ALL);r.cars[0].power=6;ok(r.usePower(0),"grab rejected");
  ok(r.cars[1].grabbedBy==0&&r.cars[1].airborne(),"target not held");
  r.cars[1].power=4;ok(!r.usePower(1),"held target used weapon");
  for(int n=0;n<74;n++)r.step(1.0/60,input(r),ALL);
  ok(r.cars[1].grabbedBy<0&&r.cars[1].progress<r.cars[0].progress-70,"target not placed behind");
  ok(r.cars[1].health==3,"grab caused health damage");
  r=new RaceModel(ALL,42,0);r.countdown=0;for(int i=0;i<4;i++)place(r,i,1000+i*400,0);
  r.step(1.0/60,new double[4],ALL);r.cars[0].power=6;ok(!r.usePower(0)&&r.cars[0].power==6,"empty grab consumed item");
  r=new RaceModel(ALL,42,0);r.countdown=0;for(int i=0;i<4;i++)place(r,i,1000+i*90,0);
  r.step(1.0/60,new double[4],ALL);r.cars[0].power=6;r.usePower(0);r.leave(0);r.step(1.0/60,input(r),ALL);
  ok(r.cars[1].grabbedBy<0,"leaving owner trapped rival");
  r=new RaceModel(ALL,42,0);r.countdown=0;r.pausedBy=1;
  double start=r.cars[0].x;r.cars[0].power=1;
  for(int n=0;n<120;n++)r.step(1.0/60,input(r),ALL);
  ok(r.elapsed==0&&r.cars[0].x==start&&!r.usePower(0),"pause did not freeze race/items");
  r.pausedBy=-1;r.autoUse[0]=true;r.step(1.0/60,input(r),ALL);
  ok(r.cars[0].power==0&&r.cars[0].boostTimer>0,"auto boost failed");
  r.cars[0].power=3;r.autoUse[0]=false;r.step(1.0/60,input(r),ALL);
  ok(r.cars[0].power==3,"manual item fired automatically");
  Track t=new Track(0);int close=0;for(int i=0;i<Track.COUNT;i++){double edge=(1-t.ellipseRadius(t.x[i],t.y[i]))*Math.min(t.maxX-t.minX,t.maxY-t.minY)/2;if(edge<220)close++;}
  ok(close>Track.COUNT/4,"not enough table edge sections");System.out.println("PASS grabber lift/drop/cancel and table-edge route ("+close+" near-edge samples)");
 }
}
