package dev.jamescullimore.tinyracers.spike;

/** Fixed-step host simulation. No Android dependencies; all combat is authoritative. */
final class RaceModel {
    static final Track TRACK=new Track();
    final Track track;
    final int laps;
    final boolean solo;
    static final double MAX_SPEED=210,ACCELERATION=114,TURN_RATE=3,CAR_DIAMETER=40;
    static final double ZOOM=1.55,VIEW_W=1280/ZOOM,VIEW_H=720/ZOOM,JUMP_SECONDS=1.15;
    static final double MIN_ZOOM=.82, CATCHUP_SECONDS=2;
    static final int MAX_HEALTH=3;
    static final double MALLET_SECONDS=1.05, GLOVE_SECONDS=.75, GLOVE_RANGE=175, FALL_SECONDS=.9;
    static final String[] POWER_NAMES={"","Boost","Toy ball","Oil slick","Toy hammer","Boxing glove","Grabber stick"};
    final Car[] cars=new Car[4];
    final boolean[] autoUse=new boolean[4];
    int pausedBy=-1;
    final double[] pickupDistance=new double[60],pickupWait=new double[60];
    final int[] pickupCycle=new int[60];
    final double[] ramps={600,2600,5200,7900,10600,13500,16400,19600,22600,25700,28700,31800,34200,37100,39800,42600};
    final double[] rampLane=new double[ramps.length],rampHalfWidth=new double[ramps.length];
    final double[] padDistance=new double[28],padLane=new double[28];
    final Hazard[] hazards=new Hazard[24];
    private final Track.Point scratch=new Track.Point();
    private final boolean[] active=new boolean[4];
    double cameraX,cameraY,countdown=3,elapsed,roundBreak,courseProgress;
    double zoom=ZOOM, requiredZoom=ZOOM, separationTime;
    private double accumulator,restartDistance;
    int round=1,roundWinner=-1,matchWinner=-1;
    static final class Car {
        double x,y,heading,speed,progress,bumpTimer,danger,explosion,pushX,pushY,padCooldown;
        double boostTimer,slowTimer,spinTimer,invulnerable,jumpTime,jumpCooldown,landing;
        int grabbedBy=-1,grabTarget=-1;
        double grabTime,itemWait;
        double attackTime,attackHeading,attackReach=200,oilSpray,fallTime,spinVisual;
        int place,points,power,health=MAX_HEALTH,attackType,hitMask,knockouts,jumps;
        boolean left;
        boolean airborne(){return jumpTime>0||grabbedBy>=0;}
        double height(){if(grabbedBy>=0)return .8;return airborne()?Math.sin(Math.PI*Math.min(1,jumpTime/JUMP_SECONDS)):0;}
    }
    static final class Hazard {
        final int owner,type;final double heading;
        double x,y,remaining;int hitMask;
        Hazard(int owner,int type,Car car){this.owner=owner;this.type=type;heading=car.heading;
            double offset=type==2?38:-72;x=car.x+Math.cos(heading)*offset;y=car.y+Math.sin(heading)*offset;
            remaining=type==2?2:9;}
    }
    RaceModel(boolean[] joined){this(joined,System.nanoTime());}
    RaceModel(boolean[] joined,long seed){this(joined,seed,2);}
    RaceModel(boolean[] joined,long seed,int theme){this(joined,seed,theme,1);}
    RaceModel(boolean[] joined,long seed,int theme,int laps){
        if(laps<1||laps>3)throw new IllegalArgumentException("Laps must be 1–3");
        this.laps=laps;
        int entrants=0;for(boolean player:joined)if(player)entrants++;
        solo=entrants==1;
        track=theme==2?TRACK:new Track(theme);
        for(int i=0;i<ramps.length;i++)ramps[i]*=track.length/45000;
        java.util.Random random=new java.util.Random(seed);
        for(int i=0;i<ramps.length;i++){rampLane[i]=i%3==0?0:i%3==1?-49:49;rampHalfWidth[i]=i%3==0?84:32;}
        for(int i=0;i<padDistance.length;i++){padDistance[i]=1100+i*(track.length-1900)/padDistance.length+random.nextDouble()*220;padLane[i]=(random.nextInt(3)-1)*49;}
        for(int i=0;i<4;i++)if(joined[i])cars[i]=new Car();
        for(int i=0;i<pickupDistance.length;i++)pickupDistance[i]=280+i*(track.length-500)/pickupDistance.length;
        resetGrid(0);countdown=3;
    }
    private void resetGrid(double start){
        int n=0;zoom=ZOOM;requiredZoom=ZOOM;separationTime=0;
        for(int k=0;k<4;k++){
            // Rotate starting lanes each round.
            int i=(k+round-1)%4;Car c=cars[i];if(c==null||c.left)continue;
            track.at(start-(n/2)*58,scratch);double lane=n%2==0?-25:25;n++;
            c.x=scratch.x-Math.sin(scratch.heading)*lane;c.y=scratch.y+Math.cos(scratch.heading)*lane;
            c.heading=scratch.heading;c.progress=start-((n-1)/2)*58;c.speed=0;c.place=0;c.power=0;c.health=MAX_HEALTH;
            c.boostTimer=c.slowTimer=c.spinTimer=c.invulnerable=c.jumpTime=c.jumpCooldown=c.landing=0;
            c.bumpTimer=c.danger=c.explosion=c.attackTime=c.oilSpray=c.fallTime=c.spinVisual=0;c.attackType=c.hitMask=0;c.grabbedBy=c.grabTarget=-1;c.grabTime=c.itemWait=0;c.pushX=c.pushY=c.padCooldown=0;
        }
        java.util.Arrays.fill(hazards,null);java.util.Arrays.fill(pickupWait,0);updateCamera(1,true);
    }
    void leave(int slot){if(complete())return;Car c=cars[slot];if(c!=null){c.left=true;eliminate(c);}}
    boolean complete(){return matchWinner>=0;}
    private void eliminate(Car c){if(c.place!=0)return;c.place=-1;c.speed=0;c.pushX=c.pushY=0;c.power=0;c.attackTime=0;c.jumpTime=0;c.explosion=1;}
    private void updateCamera(double dt,boolean snap){
        Car leader=null;for(Car c:cars)if(c!=null&&c.place==0&&(leader==null||c.progress>leader.progress))leader=c;
        if(leader==null)return;
        double minX=leader.x,maxX=leader.x,minY=leader.y,maxY=leader.y;
        for(Car c:cars)if(c!=null&&c.place==0){minX=Math.min(minX,c.x);maxX=Math.max(maxX,c.x);minY=Math.min(minY,c.y);maxY=Math.max(maxY,c.y);}
        requiredZoom=Math.min(ZOOM,Math.min(1120/(maxX-minX+100),560/(maxY-minY+100)));
        double targetZoom=Math.max(MIN_ZOOM,requiredZoom);
        zoom=snap?ZOOM:zoom+(targetZoom-zoom)*(1-Math.exp(-(targetZoom<zoom?3:1.6)*dt));
        double tx=(minX+maxX)/2,ty=(minY+maxY)/2;
        // Keep the leader visible even after the group exceeds the zoom limit.
        tx=Math.max(leader.x-viewWidth()/2+100,Math.min(leader.x+viewWidth()/2-100,tx));
        ty=Math.max(leader.y-viewHeight()/2+100,Math.min(leader.y+viewHeight()/2-100,ty));
        double blend=snap?1:1-Math.exp(-8*dt);cameraX+=(tx-cameraX)*blend;cameraY+=(ty-cameraY)*blend;
    }
    double viewWidth(){return 1280/zoom;}
    double viewHeight(){return 720/zoom;}
    double raceDistance(){return track.length*laps;}
    int currentLap(){return Math.min(laps,1+(int)(courseProgress/track.length));}
    private double lapGap(double progress,double position){double d=((progress-position)%track.length+track.length)%track.length;return Math.min(d,track.length-d);}

    double pickupX(int i){track.at(pickupDistance[i],scratch);return scratch.x;}
    double pickupY(int i){track.at(pickupDistance[i],scratch);return scratch.y;}
    void aim(Car c,Track.Point out){track.at(c.progress+85,out);}
    double botSteering(int slot,Track.Point out){
        Car c=cars[slot];aim(c,out);
        return Math.max(-1,Math.min(1,wrap(Math.atan2(out.y-c.y,out.x-c.x)-c.heading)*2));
    }
    boolean usePower(int slot){
        if(pausedBy>=0||slot<0||slot>=4||countdown>0||roundBreak>0||complete())return false;
        Car c=cars[slot];if(c==null||c.place!=0||c.power==0||c.airborne()||c.attackTime>0)return false;
        int type=c.power;
        if(type==1){c.boostTimer=1.5;c.speed=Math.max(c.speed,MAX_SPEED*1.25);}
        else if(type==5){return false;} // Collected gloves arm automatically; proximity triggers one punch.
        else if(type==6){
            int target=-1;double best=185;
            for(int j=0;j<4;j++){Car other=cars[j];if(j==slot||other==null||other.place!=0||!active[j]||other.airborne()||other.grabTarget>=0||other.invulnerable>0)continue;
                double dx=other.x-c.x,dy=other.y-c.y,d=Math.hypot(dx,dy);
                if(d<best&&dx*Math.cos(c.heading)+dy*Math.sin(c.heading)>15){best=d;target=j;}}
            if(target<0)return false;
            c.grabTarget=target;c.attackType=6;c.attackTime=1.2;c.attackHeading=c.heading;
            Car held=cars[target];held.grabbedBy=slot;held.grabTime=1.2;held.speed=0;held.pushX=held.pushY=0;held.attackTime=0;
        }
        else if(type==4){c.attackType=4;c.attackTime=MALLET_SECONDS;c.hitMask=0;c.attackHeading=c.heading;}
        else {
            int empty=-1;for(int i=0;i<hazards.length;i++)if(hazards[i]==null){empty=i;break;}
            if(empty<0)return false;hazards[empty]=new Hazard(slot,type,c);if(type==3)c.oilSpray=.65;
        }
        c.power=0;return true;
    }
    private void damage(int target,int owner){
        Car c=cars[target];if(c==null||c.place!=0||!active[target]||c.airborne()||c.invulnerable>0)return;
        c.health--;c.invulnerable=.85;c.slowTimer=1;c.speed*=.4;c.bumpTimer=.45;
        if(c.health<=0){eliminate(c);if(owner>=0&&cars[owner]!=null)cars[owner].knockouts++;}
    }
    private void finishMatch(){
        // Points decide rank. Ties: course progress, then knockouts, then shared place.
        int best=-1;
        for(int i=0;i<4;i++)if(cars[i]!=null){
            Car c=cars[i];int rank=1;
            for(Car other:cars)if(other!=null&&ahead(other,c))rank++;
            c.place=rank;c.speed=0;c.attackTime=0;c.jumpTime=0;
            if(rank==1&&(best<0||i<best))best=i;
        }
        matchWinner=best;
    }
    private boolean ahead(Car a,Car b){
        if(a.left!=b.left)return !a.left;
        if(a.points!=b.points)return a.points>b.points;
        if(Math.round(a.progress)!=Math.round(b.progress))return Math.round(a.progress)>Math.round(b.progress);
        return a.knockouts>b.knockouts;
    }
    private void elimination(double dt){
        updateCamera(dt,false);Car leader=null;int survivors=0,participants=0;
        for(Car c:cars)if(c!=null&&!c.left){participants++;if(c.place==0&&(leader==null||c.progress>leader.progress))leader=c;}
        boolean stretched=requiredZoom<MIN_ZOOM&&zoom<=MIN_ZOOM+.025;
        separationTime=stretched?separationTime+dt:0;
        // Zooming out is the warning. At the cap, allow two seconds to regroup.
        // Resolve the whole round in favour of the furthest surviving racer.
        boolean clearLeader=leader!=null;
        for(Car c:cars)if(c!=null&&c!=leader&&c.place==0&&leader.progress-c.progress<1)clearLeader=false;
        for(Car c:cars)if(c!=null&&!c.left&&c.place==0){
            c.danger=c!=leader?separationTime:0;
            if(clearLeader&&c!=leader&&separationTime>=CATCHUP_SECONDS)eliminate(c);else survivors++;
        }
        if(leader!=null)courseProgress=Math.max(courseProgress,leader.progress);
        boolean falling=false;for(Car c:cars)if(c!=null&&c.fallTime>0)falling=true;
        if(falling)return;
        if(survivors==1&&participants>=2){
            for(int i=0;i<4;i++)if(cars[i]!=null&&cars[i].place==0){roundWinner=i;cars[i].points++;restartDistance=cars[i].progress;}
            roundBreak=2.4;
            for(Car c:cars)if(c!=null){c.speed=0;c.boostTimer=c.slowTimer=0;c.attackTime=0;c.power=0;}
            java.util.Arrays.fill(hazards,null);
        }else if(survivors==0&&participants>=2){roundWinner=-1;restartDistance=courseProgress;roundBreak=2.4;}
        else if((solo&&survivors==0)||(!solo&&participants<2)){roundWinner=-1;restartDistance=courseProgress;roundBreak=2.4;}
        if(courseProgress>=raceDistance())finishMatch();
    }
    void step(double dt,double[] steering,boolean[] connected){
        if(pausedBy>=0)return;
        accumulator+=Math.max(0,Math.min(.1,dt));
        while(accumulator>=1.0/60){tick(1.0/60,steering,connected);accumulator-=1.0/60;}
    }
    private void tick(double dt,double[] steering,boolean[] connected){
        for(int i=0;i<4;i++){
            active[i]=connected[i];Car c=cars[i];if(c==null)continue;c.explosion=Math.max(0,c.explosion-dt);
            if(c.fallTime>0){c.fallTime=Math.max(0,c.fallTime-dt);if(c.fallTime==0)c.explosion=1;}
        }
        if(complete())return;
        if(roundBreak>0){int online=0;for(int i=0;i<4;i++)if(cars[i]!=null&&!cars[i].left&&active[i])online++;
            roundBreak=Math.max(.001,roundBreak-dt);
            if(roundBreak<=.001&&online>=(solo?1:2)){round++;roundWinner=-1;roundBreak=0;resetGrid(restartDistance);countdown=2;}return;}
        if(countdown>0){countdown=Math.max(0,countdown-dt);return;}
        elapsed+=dt;
        for(int i=0;i<4;i++){
            Car c=cars[i];if(c==null)continue;c.itemWait=Math.max(0,c.itemWait-dt);
            if(autoUse[i]&&active[i]&&c.place==0&&c.itemWait==0&&c.power>0){
                boolean target=c.power==1||c.power==3;
                for(int j=0;j<4;j++){Car other=cars[j];if(j==i||other==null||!active[j]||other.place!=0||other.airborne())continue;
                    double dx=other.x-c.x,dy=other.y-c.y;
                    if(dx*Math.cos(c.heading)+dy*Math.sin(c.heading)>0&&Math.hypot(dx,dy)<(c.power==4?120:260))target=true;
                }
                if(target&&usePower(i))c.itemWait=.8;
            }
        }
        for(int i=0;i<pickupWait.length;i++)pickupWait[i]=Math.max(0,pickupWait[i]-dt);
        for(int i=0;i<4;i++){
            Car c=cars[i];if(c==null||c.place!=0)continue;
            if(c.grabbedBy>=0)continue;
            c.oilSpray=Math.max(0,c.oilSpray-dt);c.padCooldown=Math.max(0,c.padCooldown-dt);
            c.bumpTimer=Math.max(0,c.bumpTimer-dt);c.invulnerable=Math.max(0,c.invulnerable-dt);
            c.boostTimer=Math.max(0,c.boostTimer-dt);c.slowTimer=Math.max(0,c.slowTimer-dt);c.spinTimer=Math.max(0,c.spinTimer-dt);
            c.jumpCooldown=Math.max(0,c.jumpCooldown-dt);c.landing=Math.max(0,c.landing-dt);
            if(!active[i]){c.speed=0;c.attackTime=0;c.pushX=c.pushY=0;continue;}
            boolean wasAir=c.airborne();c.jumpTime=Math.max(0,c.jumpTime-dt);
            double input=Double.isFinite(steering[i])?Math.max(-1,Math.min(1,steering[i])):0;
            track.nearest(c.x,c.y,scratch);
            double limit=MAX_SPEED*(c.boostTimer>0?1.35:1)*(c.slowTimer>0?.55:1)*(Math.abs(scratch.lateral)>(scratch.shortcut?Track.Shortcut.HALF_WIDTH:Track.HALF_WIDTH)?(track.theme==1?.65:.78):1);
            c.speed=Math.min(limit,c.speed+ACCELERATION*dt);
            // Oil rotates the visible kart while momentum slides along its original heading.
            if(c.spinTimer>0)c.spinVisual+=Math.PI*2/.85*dt;else c.spinVisual=0;
            c.heading+=input*TURN_RATE*Math.min(1,c.speed/84)*(c.airborne()?.35:1)*(c.spinTimer>0?.1:1)*dt;
            c.x+=(Math.cos(c.heading)*c.speed+c.pushX)*dt;c.y+=(Math.sin(c.heading)*c.speed+c.pushY)*dt;
            c.pushX*=Math.exp(-5*dt);c.pushY*=Math.exp(-5*dt);
            constrain(c,true);if(c.place!=0)continue;
            track.nearest(c.x,c.y,scratch);
            double previous=c.progress,delta=scratch.distance-((c.progress%track.length+track.length)%track.length);
            if(delta>track.length/2)delta-=track.length;if(delta<-track.length/2)delta+=track.length;
            if(Math.abs(delta)<20)c.progress+=delta; // Off-road projection cannot jump across route sections.
            if(wasAir&&!c.airborne()){
                c.landing=.45;
                for(int j=0;j<4;j++)if(j!=i&&cars[j]!=null&&Math.hypot(cars[j].x-c.x,cars[j].y-c.y)<58)damage(j,i);
            }
            if(!c.airborne()&&c.jumpCooldown==0&&c.speed>100){
                for(int r=0;r<ramps.length;r++)if(delta>0&&Math.floor((previous-ramps[r])/track.length)<Math.floor((c.progress-ramps[r])/track.length)&&delta<20&&Math.abs(scratch.lateral-rampLane[r])<rampHalfWidth[r]){c.jumpTime=JUMP_SECONDS;c.jumpCooldown=2;c.jumps++;break;}
            }
            if(!c.airborne()&&c.padCooldown==0)for(int pad=0;pad<padDistance.length;pad++){
                if(lapGap(c.progress,padDistance[pad])<38&&Math.abs(scratch.lateral-padLane[pad])<25){
                    c.boostTimer=Math.max(c.boostTimer,1.25);c.speed=Math.max(c.speed,MAX_SPEED*1.25);c.padCooldown=2;break;
                }
            }
            if(c.power==0&&c.attackTime==0&&!c.airborne())for(int box=0;box<pickupWait.length;box++){
                if(pickupWait[box]==0&&lapGap(c.progress,pickupDistance[box])<36){
                    track.at(pickupDistance[box],scratch);
                    if(Math.hypot(c.x-scratch.x,c.y-scratch.y)<42){c.power=(box+pickupCycle[box]++)%6+1;c.itemWait=.8;pickupWait[box]=6;break;}
                }
            }
        }
        // Host owns the lift/swing/drop; held racers cannot steer, collide or collect.
        for(Car held:cars)if(held!=null&&held.grabbedBy>=0){
            Car owner=cars[held.grabbedBy];held.grabTime=Math.max(0,held.grabTime-dt);
            if(owner==null||owner.place!=0||!active[held.grabbedBy]||held.place!=0||held.grabTime==0){
                if(owner!=null){track.at(owner.progress-110,scratch);held.x=scratch.x;held.y=scratch.y;held.heading=scratch.heading;held.progress=owner.progress-110;owner.grabTarget=-1;}
                held.grabbedBy=-1;held.grabTime=0;held.speed=60;held.invulnerable=.6;held.landing=.45;
            }else{
                double angle=owner.heading+Math.PI*(1-held.grabTime/1.2);
                held.x=owner.x+Math.cos(angle)*100;held.y=owner.y+Math.sin(angle)*100;held.heading=angle;
            }
        }
        // Ground cars collide; airborne/stale/eliminated racers are ghosts.
        for(int pass=0;pass<4;pass++){
            for(int i=0;i<4;i++)for(int j=i+1;j<4;j++){
                Car a=cars[i],b=cars[j];if(a==null||b==null||a.place!=0||b.place!=0||!active[i]||!active[j]||a.airborne()||b.airborne())continue;
                double dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);if(d>=CAR_DIAMETER)continue;
                double nx=d<.001?1:dx/d,ny=d<.001?0:dy/d,k=(CAR_DIAMETER-d)/2;
                a.x-=nx*k;a.y-=ny*k;b.x+=nx*k;b.y+=ny*k;
                if(a.bumpTimer==0&&b.bumpTimer==0){
                    double closing=(Math.cos(a.heading)*a.speed+a.pushX-Math.cos(b.heading)*b.speed-b.pushX)*nx+
                        (Math.sin(a.heading)*a.speed+a.pushY-Math.sin(b.heading)*b.speed-b.pushY)*ny;
                    double impulse=Math.min(190,80+Math.max(0,closing)*.65);
                    a.pushX-=nx*impulse;a.pushY-=ny*impulse;b.pushX+=nx*impulse;b.pushY+=ny*impulse;
                    a.bumpTimer=b.bumpTimer=.28;
                }
            }
            for(int i=0;i<4;i++)if(cars[i]!=null&&cars[i].place==0&&active[i])constrain(cars[i],false);
        }
        for(int i=0;i<4;i++){
            Car c=cars[i];if(c==null||c.place!=0||!active[i]||c.airborne())continue;
            if(c.power==5&&c.attackTime==0){
                int target=-1;double closest=GLOVE_RANGE;
                for(int j=0;j<4;j++){
                    Car other=cars[j];if(j==i||other==null||other.place!=0||!active[j]||other.airborne()||other.grabTarget>=0||other.invulnerable>0)continue;
                    double d=Math.hypot(other.x-c.x,other.y-c.y);
                    double forward=(other.x-c.x)*Math.cos(c.heading)+(other.y-c.y)*Math.sin(c.heading);
                    double side=-(other.x-c.x)*Math.sin(c.heading)+(other.y-c.y)*Math.cos(c.heading);
                    if(forward>25&&Math.abs(side)<30&&d<closest){closest=d;target=j;}
                }
                if(target>=0){Car other=cars[target];c.power=0;c.attackType=5;c.attackTime=GLOVE_SECONDS;
                    c.attackHeading=c.heading;c.attackReach=Math.min(210,closest+25);c.hitMask=0;}
            }
            if(c.attackTime<=0)continue;
            c.attackTime=Math.max(0,c.attackTime-dt);
            if(c.attackType==6)continue;
            double age=(c.attackType==4?MALLET_SECONDS:GLOVE_SECONDS)-c.attackTime;
            double reach=c.attackType==4?72:gloveReach(c);
            double hx=c.x+Math.cos(c.attackHeading)*reach,hy=c.y+Math.sin(c.attackHeading)*reach;
            if(c.attackType==4&&(age<.48||age>.62))continue;
            if(c.attackType==5&&(age<.10||age>.42||c.hitMask!=0))continue;
            for(int j=0;j<4;j++)if(j!=i&&(c.hitMask&(1<<j))==0&&cars[j]!=null&&cars[j].place==0&&active[j]&&!cars[j].airborne()&&Math.hypot(cars[j].x-hx,cars[j].y-hy)<(c.attackType==4?65:36)){
                damage(j,i);c.hitMask|=1<<j;if(c.attackType==5)break;
            }
        }
        for(int h=0;h<hazards.length;h++){
            Hazard hazard=hazards[h];if(hazard==null)continue;hazard.remaining-=dt;
            if(hazard.type==2){hazard.x+=Math.cos(hazard.heading)*390*dt;hazard.y+=Math.sin(hazard.heading)*390*dt;}
            track.nearest(hazard.x,hazard.y,scratch);
            if(hazard.remaining<=0||track.outside(hazard.x,hazard.y,scratch)){hazards[h]=null;continue;}
            for(int i=0;i<4;i++){
                Car c=cars[i];if(c==null||i==hazard.owner||c.place!=0||!active[i]||c.airborne()||(hazard.hitMask&(1<<i))!=0)continue;
                if(Math.hypot(c.x-hazard.x,c.y-hazard.y)<(hazard.type==3?42:27)){
                    if(hazard.type==3){c.spinTimer=.85;c.spinVisual=0;c.slowTimer=1.25;c.speed*=.55;hazard.hitMask|=1<<i;}
                    else{damage(i,hazard.owner);hazards[h]=null;break;}
                }
            }
        }
        elimination(dt);
    }
    static double gloveReach(Car c){
        double age=GLOVE_SECONDS-c.attackTime;
        if(age<.10)return 25;
        if(age<.30)return 25+(c.attackReach-25)*(age-.10)/.20;
        if(age<.40)return c.attackReach;
        return 25+(c.attackReach-25)*Math.max(0,(GLOVE_SECONDS-age)/.35);
    }
    private void constrain(Car c,boolean slow){
        // Resolve against the exact same oriented solid footprints used by the renderer.
        for(Track.Obstacle o:track.obstacles){
            if(c.airborne()&&!track.hairpinBarriers.contains(o))continue;
            double dx=c.x-o.x,dy=c.y-o.y,cos=Math.cos(o.heading),sin=Math.sin(o.heading);
            if(Math.abs(dx)>160||Math.abs(dy)>160)continue;
            double x=dx*cos+dy*sin,y=-dx*sin+dy*cos;
            double nx=0,ny=0,push=0;
            if(Track.roundObstacle(o.type)){double d=Math.hypot(x,y);if(d<o.halfW+20){nx=d<.001?1:x/d;ny=d<.001?0:y/d;push=o.halfW+20-d;}}
            else{
                double qx=Math.max(-o.halfW,Math.min(o.halfW,x)),qy=Math.max(-o.halfH,Math.min(o.halfH,y));
                double ox=x-qx,oy=y-qy,d=Math.hypot(ox,oy);
                if(d>0&&d<20){nx=ox/d;ny=oy/d;push=20-d;}
                else if(d==0){double px=o.halfW-Math.abs(x),py=o.halfH-Math.abs(y);
                    if(px<py){nx=x>=0?1:-1;push=px+20;}else{ny=y>=0?1:-1;push=py+20;}}
            }
            if(push>0){c.x+=(nx*cos-ny*sin)*push;c.y+=(nx*sin+ny*cos)*push;
                if(c.bumpTimer==0){c.speed*=.35;c.bumpTimer=.4;}}
        }
        if(c.airborne())return;
        track.nearest(c.x,c.y,scratch);
        if(track.outside(c.x,c.y,scratch)){
            eliminate(c);c.explosion=0;c.fallTime=FALL_SECONDS;
        }
    }
    static double wrap(double angle){return Math.atan2(Math.sin(angle),Math.cos(angle));}
}
