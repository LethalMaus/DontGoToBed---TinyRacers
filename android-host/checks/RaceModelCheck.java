package dev.jamescullimore.tinyracers.spike;

/** Deterministic simulation checks, runnable without Android or dependencies. */
public final class RaceModelCheck {
    static final boolean[] PAIR={true,true,false,false},ALL={true,true,true,true};
    static final Track.Point point=new Track.Point();
    static void require(boolean ok,String message){if(!ok)throw new AssertionError(message);}
    static void place(RaceModel.Car c,double distance,double lane){
        RaceModel.TRACK.at(distance,point);c.x=point.x-Math.sin(point.heading)*lane;c.y=point.y+Math.cos(point.heading)*lane;
        c.heading=point.heading;c.progress=distance;c.speed=0;
    }
    static double autopilot(RaceModel.Car c){
        RaceModel.TRACK.at(c.progress+85,point);return Math.max(-1,Math.min(1,RaceModel.wrap(Math.atan2(point.y-c.y,point.x-c.x)-c.heading)*2));
    }
    static double[] inputs(RaceModel r){double[] a=new double[4];for(int i=0;i<4;i++)if(r.cars[i]!=null)a[i]=autopilot(r.cars[i]);return a;}
    static void frames(RaceModel r,int n,boolean[] active){for(int i=0;i<n;i++)r.step(1.0/60,inputs(r),active);}
    public static void main(String[] args){
        circuit();rounds();combat();jump();rankings();boundaries();offRoad();automaticGlove();bumperAndPads();
        System.out.println("PASS: long circuit, all ramps, camera, scoring/reset, standings/ties, five powers, damage immunity, jump/landing, forward glove, bumper shoves, narrow ramps, random booster pads, off-road solids, delayed falls and frame-rate independence.");
    }
    static void circuit(){
        require(Math.abs(RaceModel.TRACK.length-45000)<.01,"incorrect circuit length");
        Track track=RaceModel.TRACK;
        for(int i=0;i<Track.COUNT;i++)for(int j=i+1;j<Track.COUNT;j++){
            double arc=Math.abs(track.s[i]-track.s[j]);arc=Math.min(arc,track.length-arc);
            if(arc>1200)require(Math.hypot(track.x[i]-track.x[j],track.y[i]-track.y[j])>2*Track.HALF_WIDTH+35,"distant road surfaces overlap");
        }
        require(RaceModel.TRACK.length/(RaceModel.MAX_SPEED*1.35)>120,"boosted ideal lap under two minutes");
        RaceModel race=new RaceModel(PAIR,42);double start=race.cars[0].x;
        frames(race,120,PAIR);require(race.cars[0].x==start,"countdown moved racers");
        race.cars[0].points=7; // Points do not end the circuit early.
        for(int frame=0;frame<60*360&&!race.complete();frame++){
            race.step(1.0/60,inputs(race),PAIR);
            for(RaceModel.Car c:race.cars)if(c!=null&&c.place==0){
                require(Double.isFinite(c.x)&&Double.isFinite(c.y),"invalid position");
                if(c.progress>=race.courseProgress-10)require(Math.abs(c.x-race.cameraX)<RaceModel.VIEW_W/2&&Math.abs(c.y-race.cameraY)<RaceModel.VIEW_H/2,"leader left camera");
            }
        }
        require(race.complete(),"autopilot could not finish winding circuit");
        require(race.elapsed>=120,"actual lap under two minutes");
        require(race.cars[0].jumps>=4,"lap did not traverse ramps");
        System.out.printf("Normal circuit: %.1f driving seconds, %d jumps, %d rounds%n",race.elapsed,race.cars[0].jumps,race.round);
        race=new RaceModel(PAIR,42);race.countdown=0;
        for(int i=0;i<60*280&&!race.complete();i++){
            for(RaceModel.Car c:race.cars)if(c!=null)c.boostTimer=2;
            race.step(1.0/60,inputs(race),PAIR);
        }
        require(race.complete()&&race.elapsed>=120,"permanent-boost lap invalid");
        System.out.printf("Permanent-boost circuit: %.1f driving seconds%n",race.elapsed);
    }
    static void rounds(){
        RaceModel r=new RaceModel(ALL,42);r.countdown=0;
        for(int i=0;i<2000&&r.roundBreak==0;i++)r.step(1.0/60,inputs(r),new boolean[]{true,false,false,false});
        require(r.cars[0].points==1&&r.roundBreak>0,"last survivor not awarded exactly one point");
        double progress=r.cars[0].progress;
        frames(r,300,new boolean[]{true,false,false,false});require(r.round==1&&r.cars[0].points==1,"absent-controller farming");
        r.step(1.0/60,new double[4],ALL);require(r.round==2&&r.countdown>0,"missing next round");
        for(RaceModel.Car c:r.cars){require(c.place==0&&c.health==3&&c.power==0,"respawn not clean");require(Math.abs(c.progress-progress)<=60,"respawn far from winner");}
        r.leave(3);frames(r,180,ALL);require(r.cars[3].left&&r.cars[3].place<0,"leaver respawned");
        r=new RaceModel(PAIR,42);r.countdown=0;r.leave(1);frames(r,300,PAIR);require(r.cars[0].points==0,"solo player earned free points");
    }
    static RaceModel arena(){RaceModel r=new RaceModel(ALL,42);r.countdown=0;for(int i=0;i<4;i++)place(r.cars[i],1000-i*60,(i%2)*45-22);return r;}
    static void combat(){
        RaceModel r=arena();RaceModel.Car a=r.cars[0],b=r.cars[1];
        a.power=1;r.countdown=1;require(!r.usePower(0)&&a.power==1,"countdown power");r.countdown=0;
        require(r.usePower(0)&&a.power==0&&a.speed>RaceModel.MAX_SPEED,"boost failed");require(!r.usePower(0),"double use");
        frames(r,110,ALL);require(a.boostTimer==0,"boost failed to expire");
        for(int type=2;type<=5;type++){
            r=arena();a=r.cars[0];b=r.cars[1];place(a,1000,0);place(b,type==3?950:type==5?1150:1080,0);
            if(type==5){place(r.cars[2],1250,0);place(r.cars[3],1300,0);}
            a.power=type;if(type!=5)require(r.usePower(0),"power rejected: "+type);
            if(type==3){b.speed=180;frames(r,5,ALL);require(b.spinTimer>0&&b.health==3,"oil did not spin without health damage");}
            else{frames(r,32,ALL);require(b.health==2,"weapon must damage exactly once: "+type+" health "+b.health);}
            require(a.health==3,"weapon damaged owner");
        }
        r=arena();a=r.cars[0];b=r.cars[1];place(a,1000,0);place(b,1080,0);b.health=1;
        a.power=4;r.usePower(0);frames(r,40,ALL);require(b.place<0&&b.explosion>0&&a.knockouts==1,"damage knockout failed");
        r=arena();a=r.cars[0];b=r.cars[1];place(a,1000,0);place(b,1080,0);b.jumpTime=1;
        a.power=4;r.usePower(0);frames(r,40,ALL);require(b.health==3,"hammer hit airborne driver");
        r=arena();a=r.cars[0];b=r.cars[1];place(a,1000,0);place(b,1080,0);
        a.power=4;r.usePower(0);frames(r,40,new boolean[]{true,false,true,true});require(b.health==3,"hammer hit inactive driver");
        r=arena();a=r.cars[0];for(int i=0;i<r.hazards.length;i++){a.power=2;require(r.usePower(0),"pool capacity");}
        a.power=2;require(!r.usePower(0)&&a.power==2,"full pool consumed item");frames(r,150,ALL);for(RaceModel.Hazard h:r.hazards)require(h==null,"hazard leaked");
        r=arena();a=r.cars[0];place(a,r.pickupDistance[0],0);r.step(1.0/60,inputs(r),ALL);require(a.power==1&&r.pickupWait[0]>0,"pickup failed");
    }
    static void jump(){
        RaceModel r=arena();RaceModel.Car a=r.cars[0],b=r.cars[1];place(a,598,0);a.speed=210;
        r.step(1.0/60,inputs(r),ALL);require(a.airborne()&&a.jumps==1,"ramp did not launch");
        a.power=4;require(!r.usePower(0)&&a.power==4,"airborne weapon use");
        // Landing onto a grounded car damages it once and draws a landing shockwave.
        r=arena();a=r.cars[0];b=r.cars[1];place(a,1000,0);place(b,1005,0);a.jumpTime=.02;a.speed=210;
        frames(r,2,ALL);require(!a.airborne()&&a.landing>0&&b.health==2,"landing damage missing");
        frames(r,15,ALL);require(b.health==2,"landing damaged repeatedly");
    }
    static void rankings(){
        RaceModel r=arena();for(int i=0;i<4;i++)place(r.cars[i],RaceModel.TRACK.length-1-i*60,0);
        r.cars[0].speed=210;r.cars[0].points=1;r.cars[1].points=3;r.cars[2].points=2;r.cars[3].points=2;
        r.step(1.0/60,inputs(r),ALL);require(r.complete()&&r.matchWinner==1,"distance incorrectly beat points");
        require(r.cars[0].place==4&&r.cars[1].place==1&&r.cars[2].place==2&&r.cars[3].place==3,"rank order incorrect");
        r.leave(1);require(r.cars[1].place==1,"leave changed final result");
        r=arena();for(int i=0;i<4;i++){place(r.cars[i],RaceModel.TRACK.length-1, 0);r.cars[i].speed=210;r.cars[i].points=2;}
        r.step(1.0/60,inputs(r),ALL);require(r.cars[0].place==1&&r.cars[1].place==1,"exact ties not shared");
    }
    static void automaticGlove(){
        RaceModel r=arena();RaceModel.Car a=r.cars[0],b=r.cars[1];
        place(a,1000,0);place(b,1300,0);place(r.cars[2],1500,0);place(r.cars[3],1700,0);
        a.power=5;r.step(1.0/60,inputs(r),ALL);require(a.power==5&&a.attackTime==0,"glove fired out of range");
        place(b,900,0);r.step(1.0/60,inputs(r),ALL);require(a.power==5,"glove fired backwards");
        place(b,1000,100);r.step(1.0/60,inputs(r),ALL);require(a.power==5,"glove fired sideways");
        place(b,1100,0);
        r.step(1.0/60,inputs(r),ALL);require(a.power==0&&a.attackType==5&&a.attackTime>0,"glove did not auto trigger");
        frames(r,35,ALL);require(b.health==2,"automatic forward punch missed");frames(r,20,ALL);require(b.health==2&&a.attackTime==0,"glove repeated or failed to retract");
        r=arena();a=r.cars[0];a.power=5;a.jumpTime=1;r.step(1.0/60,inputs(r),ALL);require(a.power==5,"airborne glove auto fired");
        r=arena();a=r.cars[0];a.power=5;r.step(1.0/60,inputs(r),new boolean[]{false,true,true,true});require(a.power==5,"stale owner auto fired");
        r=arena();a=r.cars[0];a.power=5;for(int i=1;i<4;i++)r.cars[i].jumpTime=1;
        r.step(1.0/60,inputs(r),ALL);require(a.power==5,"glove targeted airborne rival");
    }
    static void offRoad(){
        RaceModel r=arena();RaceModel.Car a=r.cars[0];place(a,1200,120);double x=a.x,y=a.y;
        r.step(1.0/60,new double[4],ALL);require(Math.hypot(a.x-x,a.y-y)<1&&a.place==0,"road still has invisible walls");
        Track.Obstacle o=RaceModel.TRACK.obstacles[0];a.x=o.x;a.y=o.y;a.jumpTime=0;a.bumpTimer=0;
        r.step(1.0/60,new double[4],ALL);require(Math.hypot(a.x-o.x,a.y-o.y)>=o.halfH+19,"solid object did not eject overlap");require(a.bumpTimer>0,"missing obstacle impact");
        a.x=o.x;a.y=o.y;a.jumpTime=.8;r.step(1.0/60,new double[4],ALL);require(Math.hypot(a.x-o.x,a.y-o.y)<2,"airborne car blocked by obstacle");
        r=arena();a=r.cars[0];place(a,1200,Track.TABLE_HALF_WIDTH+5);
        r.step(1.0/60,new double[4],ALL);require(a.place<0&&a.fallTime>0&&a.explosion==0,"edge did not start delayed fall");
        double progress=a.progress;frames(r,30,new boolean[]{false,true,true,true});require(a.fallTime>0&&a.explosion==0&&a.progress==progress,"fall animation skipped or gained progress");
        frames(r,26,new boolean[]{false,true,true,true});require(a.fallTime==0&&a.explosion>0,"fall did not end in explosion while stale");
        r=new RaceModel(PAIR,42);r.countdown=0;place(r.cars[0],1200,0);place(r.cars[1],1200,Track.TABLE_HALF_WIDTH+5);
        r.step(1.0/60,new double[4],PAIR);require(r.roundBreak==0&&r.cars[0].points==0,"round ended before fall animation");
        frames(r,56,PAIR);require(r.cars[0].points==1,"fall survivor not scored once");
    }
    static void bumperAndPads(){
        RaceModel r=arena();RaceModel.Car a=r.cars[0],b=r.cars[1];
        place(a,1000,-15);place(b,1000,15);
        r.step(1.0/60,new double[4],ALL);
        require(Math.hypot(a.pushX,a.pushY)>70&&Math.hypot(b.pushX,b.pushY)>70,"contact lacks bumper impulse");
        require(a.health==3&&b.health==3,"ordinary contact caused damage");
        double separation=Math.hypot(a.x-b.x,a.y-b.y);
        for(int i=0;i<6;i++)r.step(1.0/60,new double[4],ALL);
        require(Math.hypot(a.x-b.x,a.y-b.y)>separation+7,"bumper impulse did not move cars apart");
        r=arena();a=r.cars[0];place(a,r.padDistance[0],r.padLane[0]);
        r.step(1.0/60,new double[4],ALL);require(a.boostTimer>1&&a.padCooldown>0,"pad failed to boost");
        a.boostTimer=0;r.step(1.0/60,new double[4],ALL);require(a.boostTimer==0,"pad retriggered while occupied");
        r=arena();a=r.cars[0];place(a,r.padDistance[0],r.padLane[0]);a.jumpTime=1;
        r.step(1.0/60,new double[4],ALL);require(a.boostTimer==0,"airborne pad activation");
        r=arena();a=r.cars[0];place(a,r.ramps[1]-2,-r.rampLane[1]);a.speed=210;
        r.step(1.0/60,new double[4],ALL);require(!a.airborne(),"narrow ramp cannot be avoided");
        place(a,r.ramps[1]-2,r.rampLane[1]);a.speed=210;
        r.step(1.0/60,new double[4],ALL);require(a.airborne(),"narrow ramp does not launch in its lane");
        RaceModel same=new RaceModel(ALL,42),different=new RaceModel(ALL,43);
        require(same.padDistance[0]==r.padDistance[0]&&same.padDistance[0]!=different.padDistance[0],"pad randomization not seeded");
    }
    static void boundaries(){
        RaceModel a=new RaceModel(PAIR,42),b=new RaceModel(PAIR,42);double[] turn={.2,.3,0,0};
        for(int i=0;i<1200;i++)a.step(1.0/60,turn,PAIR);for(int i=0;i<600;i++)b.step(1.0/30,turn,PAIR);
        for(int i=0;i<2;i++)require(Math.abs(a.cars[i].x-b.cars[i].x)<.001,"frame-rate dependence");
        RaceModel r=arena();for(RaceModel.Car c:r.cars)place(c,1000,0);r.step(1.0/60,new double[4],ALL);
        frames(r,120,ALL);for(RaceModel.Car c:r.cars){RaceModel.TRACK.nearest(c.x,c.y,point);require(Math.hypot(c.x-point.x,c.y-point.y)<=Track.TABLE_HALF_WIDTH+.01,"escaped table");}
        r=arena();place(r.cars[0],-2,0);r.cars[0].heading+=Math.PI;r.cars[0].speed=100;r.step(1.0/60,new double[4],ALL);
        require(r.cars[0].progress<0&&!r.complete(),"reverse crossing fabricated lap");
    }
}
