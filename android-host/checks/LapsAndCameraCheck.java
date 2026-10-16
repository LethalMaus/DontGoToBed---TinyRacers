package dev.jamescullimore.tinyracers.spike;
public class LapsAndCameraCheck {
 static final boolean[] PAIR={true,true,false,false}, STILL={false,false,false,false};
 static void ok(boolean b,String m){if(!b)throw new AssertionError(m);}
 static void place(RaceModel r,int slot,double progress){Track.Point p=new Track.Point();r.track.at(progress,p);RaceModel.Car c=r.cars[slot];c.x=p.x;c.y=p.y;c.heading=p.heading;c.progress=progress;c.speed=0;}
 static void frames(RaceModel r,int count){for(int i=0;i<count;i++)r.step(1./60,new double[4],STILL);}
 public static void main(String[] args){
  RaceModel r=new RaceModel(PAIR,42,2,3);r.countdown=0;
  place(r,0,4000);place(r,1,1000);frames(r,90);
  ok(r.zoom<RaceModel.ZOOM&&r.zoom>=RaceModel.MIN_ZOOM,"camera did not widen within cap");
  ok(r.cars[0].points==0&&r.cars[1].place==0,"no catchup grace");
  place(r,1,3980);frames(r,1);ok(r.separationTime==0,"catchup did not cancel elimination");
  frames(r,180);ok(r.zoom>1.5&&r.cars[1].place==0,"camera did not recover");
  place(r,1,1000);frames(r,300);ok(r.cars[0].points==1&&r.cars[1].place<0,"furthest racer must win separated round");
  frames(r,300);ok(r.cars[0].points==1,"repeated points during round break");
  for(int laps=1;laps<=3;laps++){
   r=new RaceModel(PAIR,42,2,laps);r.countdown=0;
   place(r,0,r.track.length-3);place(r,1,r.track.length-30);r.cars[0].speed=210;
   for(int i=0;i<3;i++)r.step(1./60,new double[4],PAIR);
   ok(r.complete()==(laps==1),"wrong finish at first lap for "+laps);
   if(laps>1){
    place(r,0,r.track.length+598);place(r,1,r.track.length+550);r.cars[0].speed=210;r.cars[0].jumpCooldown=0;
    r.step(1./60,new double[4],PAIR);ok(r.cars[0].jumps>0,"second-lap ramp missing");
    r.cars[0].jumpTime=0;r.cars[0].padCooldown=0;
    Track.Point p=new Track.Point();double d=r.track.length+r.padDistance[0];r.track.at(d,p);
    place(r,0,d);r.cars[0].x-=Math.sin(p.heading)*r.padLane[0];r.cars[0].y+=Math.cos(p.heading)*r.padLane[0];place(r,1,d-50);
    r.step(1./60,new double[4],PAIR);ok(r.cars[0].boostTimer>0,"second-lap booster missing");
    r.cars[0].power=0;r.cars[0].attackTime=0;place(r,0,r.track.length+r.pickupDistance[0]);place(r,1,r.track.length+r.pickupDistance[0]-50);
    r.step(1./60,new double[4],PAIR);ok(r.cars[0].power>0,"second-lap pickup missing");
    place(r,0,r.raceDistance()-3);place(r,1,r.raceDistance()-30);r.cars[0].speed=210;
    for(int i=0;i<3;i++)r.step(1./60,new double[4],PAIR);
    ok(r.complete(),"did not finish selected laps");
   }
  }
  System.out.println("PASS 1–3 lap boundaries; repeat ramps/pads/items; zoom cap, grace, catchup cancellation and leader point.");
 }
}
