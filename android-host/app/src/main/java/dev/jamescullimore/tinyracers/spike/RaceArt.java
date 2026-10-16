package dev.jamescullimore.tinyracers.spike;

import android.content.Context;
import android.graphics.*;
import java.io.IOException;

/** Local family artwork and cached, code-drawn bedroom circuit. No network assets. */
final class RaceArt {
    static final int NAVY=Color.rgb(17,36,55), PANEL=Color.rgb(28,54,74), GOLD=Color.rgb(255,211,105), CREAM=Color.rgb(255,241,206), MUTED=Color.rgb(169,193,203);
    static final String[] NAMES={"Leo","Ian","Daddy","Mammy"};
    final Bitmap[] portraits=new Bitmap[4];
    final Paint p=new Paint(Paint.ANTI_ALIAS_FLAG);
    final RectF box=new RectF();
    final Bitmap[] overhead=new Bitmap[4];
    final Path road=new Path(),toyRoad=new Path();
    final Shader rampLight=new LinearGradient(-88,0,0,0,0xff9e7047,0xffefd09a,Shader.TileMode.CLAMP);
    final Track.Point marker=new Track.Point();
    final DashPathEffect dashes=new DashPathEffect(new float[]{20,28},0);
    final UiStrings strings;
    RaceArt(Context context,UiStrings strings) {
        this.strings=strings;
        String[] files={"leo_front.png","ian_front.png","papa_front.png","mammy.png"};
        for(int i=0;i<4;i++) try(java.io.InputStream in=context.getAssets().open("characters/"+files[i])) {
            portraits[i]=BitmapFactory.decodeStream(in);
        } catch(IOException e) { throw new IllegalStateException("Missing character artwork",e); }
        String[] top={"leo","ian","daddy","mammy"};
        BitmapFactory.Options options=new BitmapFactory.Options();options.inSampleSize=4;
        for(int i=0;i<4;i++)try(java.io.InputStream in=context.getAssets().open("characters/"+top[i]+(i==3?"_topdown_v2.png":"_topdown_v1.png"))){
            overhead[i]=BitmapFactory.decodeStream(in,null,options);
        }catch(IOException e){throw new IllegalStateException("Missing overhead racer",e);}

        road.close();
    }
    void rect(Canvas c,float l,float t,float r,float b,float radius,int color) {
        p.setStyle(Paint.Style.FILL);p.setColor(color);c.drawRoundRect(l,t,r,b,radius,radius,p);
    }
    void text(Canvas c,String s,float x,float y,float size,int color,boolean bold) {
        s=strings.t(s);
        p.setStyle(Paint.Style.FILL);p.setColor(color);p.setTextSize(size);
        p.setTypeface(bold?Typeface.create("sans-serif",Typeface.BOLD):Typeface.create("sans-serif",Typeface.NORMAL));
        c.drawText(s,x,y,p);
    }
    void centreFit(Canvas c,float maxWidth,String s,float x,float y,float size,int color,boolean bold){
        s=strings.t(s);p.setTypeface(Typeface.create("sans-serif",bold?Typeface.BOLD:Typeface.NORMAL));p.setTextSize(size);
        if(p.measureText(s)>maxWidth)size*=maxWidth/p.measureText(s);
        centre(c,s,x,y,size,color,bold);
    }
    void centre(Canvas c,String s,float x,float y,float size,int color,boolean bold) {
        s=strings.t(s);
        p.setTypeface(Typeface.create("sans-serif",bold?Typeface.BOLD:Typeface.NORMAL));p.setTextSize(size);
        text(c,s,x-p.measureText(s)/2,y,size,color,bold);
    }
    void portrait(Canvas c,int character,float cx,float top,float height) {
        Bitmap b=portraits[character];float w=height*b.getWidth()/b.getHeight();
        box.set(cx-w/2,top,cx+w/2,top+height);p.setAlpha(255);p.setFilterBitmap(true);c.drawBitmap(b,null,box,p);
    }
    void stars(Canvas c) {
        c.drawColor(NAVY);
        for(int i=0;i<65;i++) {p.setColor(i%4==0?0x557ed9dd:0x33ffd369);c.drawCircle((i*193+37)%1280,(i*97+41)%720,i%3==0?2:1,p);}
        p.setColor(0x163ec1bb);c.drawCircle(1100,90,260,p);
    }
    void title(Canvas c,String subtitle) {
        text(c,"DON’T GO TO BED",48,46,17,GOLD,true);
        text(c,"TINY RACERS",46,103,52,CREAM,true);
        text(c,subtitle,49,136,19,MUTED,false);
    }
    void book(Canvas c,float x,float y,float w,float h,int color,String label,float rotation) {
        c.save();c.rotate(rotation,x+w/2,y+h/2);
        rect(c,x+5,y+7,x+w+5,y+h+7,6,0x44000000);
        rect(c,x,y,x+w,y+h,5,color);
        rect(c,x+8,y+h-9,x+w-5,y+h-3,2,CREAM);
        rect(c,x+9,y+8,x+13,y+h-15,1,0x66ffffff);
        text(c,label,x+23,y+30,16,CREAM,true);c.restore();
    }
    void drawCourse(Canvas c,RaceModel race) {
        float left=(float)(race.cameraX-race.viewWidth()/2-340),top=(float)(race.cameraY-race.viewHeight()/2-340);
        float right=(float)(race.cameraX+race.viewWidth()/2+340),bottom=(float)(race.cameraY+race.viewHeight()/2+340);
        rect(c,left,top,right,bottom,0,race.track.theme==1?0xff375b38:0xff252635);
        if(race.track.theme!=1)for(int row=(int)Math.floor(top/100);row*100<bottom;row++){
            rect(c,left,row*100,right,row*100+97,0,row%2==0?0xff343441:0xff30313d);
            for(int col=(int)Math.floor(left/270)-1;col*270<right;col++){
                float x=col*270+(row%2)*135;rect(c,x,row*100,x+2,row*100+97,0,0xff252632);
                rect(c,x+24,row*100+25,x+145,row*100+26,0,0x22ffe0b0);
            }
        }
        // Only tessellate the visible road, with padding to keep line caps off-screen.
        road.rewind();boolean connected=false;
        Track track=race.track;
        for(int i=0;i<Track.COUNT;i++){
            boolean visible=Math.max(track.x[i],track.x[i+1])>=left&&Math.min(track.x[i],track.x[i+1])<=right
                &&Math.max(track.y[i],track.y[i+1])>=top&&Math.min(track.y[i],track.y[i+1])<=bottom;
            if(visible){if(!connected)road.moveTo((float)track.x[i],(float)track.y[i]);road.lineTo((float)track.x[i+1],(float)track.y[i+1]);}
            connected=visible;
        }
        p.setStyle(Paint.Style.STROKE);p.setStrokeJoin(Paint.Join.ROUND);p.setStrokeCap(Paint.Cap.ROUND);
        if(track.theme==0){
            p.setStyle(Paint.Style.FILL);
            box.set((float)track.minX-12,(float)track.minY-12,(float)track.maxX+12,(float)track.maxY+12);p.setColor(0xff62422b);c.drawOval(box,p);
            box.set((float)track.minX,(float)track.minY,(float)track.maxX,(float)track.maxY);p.setColor(0xffb78b5d);c.drawOval(box,p);
            float cx=(float)(track.minX+track.maxX)/2,cy=(float)(track.minY+track.maxY)/2;
            float rx=(float)(track.maxX-track.minX)/2,ry=(float)(track.maxY-track.minY)/2;
            p.setStrokeWidth(2);p.setColor(0x33724a30);
            for(int i=0;i<160;i++){double a=i*Math.PI/80;c.drawLine(cx,cy,cx+(float)Math.cos(a)*rx,cy+(float)Math.sin(a)*ry,p);}
            p.setStyle(Paint.Style.STROKE);
        }else{
            p.setStrokeWidth((float)Track.TABLE_HALF_WIDTH*2+32);p.setColor(0x77000000);c.drawPath(road,p);
            p.setStrokeWidth((float)Track.TABLE_HALF_WIDTH*2+14);p.setColor(track.theme==1?0xff274438:0xff594132);c.drawPath(road,p);
            p.setStrokeWidth((float)Track.TABLE_HALF_WIDTH*2+4);p.setColor(track.theme==1?0xff8dae55:0xffe0bd83);c.drawPath(road,p);
            p.setStrokeWidth((float)Track.TABLE_HALF_WIDTH*2);p.setColor(track.theme==1?0xff648845:0xffd8d1bc);c.drawPath(road,p);
        }
        // Photo-inspired lawn tufts, pale spotted rug and round grey placemats.
        p.setStyle(Paint.Style.FILL);
        if(track.theme==2)for(int gy=(int)Math.floor(top/125);gy*125<bottom;gy++)for(int gx=(int)Math.floor(left/140);gx*140<right;gx++){
            float xx=gx*140+(gy%2)*45,yy=gy*125;
            track.nearest(xx,yy,marker);
            if(Math.hypot(xx-marker.x,yy-marker.y)<Track.TABLE_HALF_WIDTH-12){p.setColor((gx+gy)%3==0?0xffaf9282:(gx+gy)%3==1?0xffa5afb1:0xffb6ac83);c.drawCircle(xx,yy,12+Math.abs(gx%3)*4,p);}
        }
        if(track.theme==1)for(int gy=(int)Math.floor(top/70);gy*70<bottom;gy++)for(int gx=(int)Math.floor(left/90);gx*90<right;gx++){
            float xx=gx*90+(gy%2)*27,yy=gy*70;p.setColor(0x556f9b55);p.setStrokeWidth(2);c.drawLine(xx-5,yy+7,xx,yy-4,p);c.drawLine(xx,yy+7,xx+5,yy-1,p);
        }
        if(track.theme==0)for(int i=0;i<12;i++){
            track.at(i*track.length/12,marker);double lane=220;
            float xx=(float)(marker.x-Math.sin(marker.heading)*lane),yy=(float)(marker.y+Math.cos(marker.heading)*lane);
            if(Math.abs(xx-race.cameraX)<650&&Math.abs(yy-race.cameraY)<450){p.setColor(0xff949b98);c.drawCircle(xx,yy,105,p);p.setColor(0xffacb0aa);c.drawCircle(xx,yy,100,p);}
        }
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(211);p.setColor(0x33000000);c.drawPath(road,p);
        p.setStrokeWidth(192);p.setColor(0xffdec28c);c.drawPath(road,p);
        p.setStrokeWidth(176);p.setColor(track.theme==1?0xffaa9570:track.theme==0?0xff655f58:0xff354753);c.drawPath(road,p);
        p.setStrokeWidth(2);p.setColor(0x667e9ca6);p.setPathEffect(dashes);c.drawPath(road,p);p.setPathEffect(null);p.setStyle(Paint.Style.FILL);
        if(track.theme==2){
            toyRoad.rewind();boolean joined=false;
            for(int i=0;i<Track.COUNT;i++){
                boolean visible=(int)(track.s[i]/1800)%3==1&&Math.abs(track.x[i]-race.cameraX)<650&&Math.abs(track.y[i]-race.cameraY)<450;
                if(visible){if(!joined)toyRoad.moveTo((float)track.x[i],(float)track.y[i]);toyRoad.lineTo((float)track.x[i+1],(float)track.y[i+1]);}joined=visible;
            }
            p.setStyle(Paint.Style.STROKE);p.setStrokeCap(Paint.Cap.BUTT);p.setStrokeJoin(Paint.Join.ROUND);
            p.setStrokeWidth(190);p.setColor(0xffffbd59);c.drawPath(toyRoad,p);
            p.setStrokeWidth(170);p.setColor(0xffec702e);c.drawPath(toyRoad,p);
            p.setStrokeWidth(3);p.setColor(0xffbd501e);c.drawPath(toyRoad,p);p.setStyle(Paint.Style.FILL);
        }
        // Narrow, marked toy-board shortcuts; their collider/progress path is shared.
        for(Track.Shortcut cut:track.shortcuts){
            p.setStyle(Paint.Style.STROKE);p.setStrokeCap(Paint.Cap.ROUND);
            p.setStrokeWidth((float)Track.Shortcut.HALF_WIDTH*2+14);p.setColor(0xffedcd87);c.drawLine((float)cut.x1,(float)cut.y1,(float)cut.x2,(float)cut.y2,p);
            p.setStrokeWidth((float)Track.Shortcut.HALF_WIDTH*2);p.setColor(0xff437e87);c.drawLine((float)cut.x1,(float)cut.y1,(float)cut.x2,(float)cut.y2,p);
            p.setStyle(Paint.Style.FILL);
            c.save();c.translate((float)((cut.x1+cut.x2)/2),(float)((cut.y1+cut.y2)/2));c.rotate((float)Math.toDegrees(Math.atan2(cut.y2-cut.y1,cut.x2-cut.x1)));
            for(int k=-1;k<=1;k++){float xx=k*65;Path arrow=new Path();arrow.moveTo(xx-12,-12);arrow.lineTo(xx+9,0);arrow.lineTo(xx-12,12);p.setStyle(Paint.Style.STROKE);p.setStrokeWidth(5);p.setColor(CREAM);c.drawPath(arrow,p);}
            p.setStyle(Paint.Style.FILL);c.restore();
        }
        // Small edge reflectors make corners readable without covering the driving line.
        for(double d=120;d<track.length;d+=240){
            track.at(d,marker);
            if(Math.abs(marker.x-race.cameraX)>550||Math.abs(marker.y-race.cameraY)>330)continue;
            c.save();c.translate((float)marker.x,(float)marker.y);c.rotate((float)Math.toDegrees(marker.heading));
            for(int side=-1;side<=1;side+=2)rect(c,-7,side*91-2,7,side*91+2,2,track.theme==1?0xffd2c390:0xffefe0b1);
            c.restore();
        }
        // Painted objects share their position, rotation and footprint with solid colliders.
        for(Track.Obstacle o:race.track.obstacles){
            if(Math.abs(o.x-race.cameraX)>race.viewWidth()/2+160||Math.abs(o.y-race.cameraY)>race.viewHeight()/2+160)continue;
            c.save();c.translate((float)o.x,(float)o.y);c.rotate((float)Math.toDegrees(o.heading));
            float w=(float)o.halfW,h=(float)o.halfH;
            if(o.type>=4){themedObstacle(c,o,race.elapsed);}
            else if(o.type==0)book(c,-w,-h,w*2,h*2,0xffba6673,"STORY TIME",0);
            else if(o.type==1){
                if(track.hairpinBarriers.contains(o)){
                    rect(c,-w-3,-h-3,w+3,h+12,6,0xff8b3736);
                    rect(c,-w,-h-9,w,h-1,5,0xffe2a34f);
                }
                rect(c,-w+4,-h+6,w+4,h+6,5,0x55000000);rect(c,-w,-h,w,h,5,0xffd85447);
                for(int xx=-25;xx<=25;xx+=50)for(int yy=-25;yy<=25;yy+=50){p.setColor(0xff983b38);c.drawCircle(xx+2,yy+3,15,p);p.setColor(0xfff27558);c.drawCircle(xx,yy,14,p);}
            }
            else if(o.type==2){rect(c,-w,-h+5,w,h+5,3,0x55000000);rect(c,-w,-h,w,h,3,GOLD);rect(c,-w,-h,-w+28,h,3,0xffda8994);rect(c,w-22,-h,w,h,2,CREAM);rect(c,w-8,-h+4,w,h-4,1,NAVY);}
            else{p.setColor(0x55000000);c.drawCircle(4,7,w,p);p.setColor(0xffcfaa70);c.drawCircle(0,0,w,p);p.setColor(0xff94745b);c.drawCircle(0,0,w-9,p);p.setColor(0xffdab980);c.drawCircle(0,0,w-16,p);p.setColor(NAVY);c.drawCircle(0,0,10,p);}
            c.restore();
        }
        race.track.at(0,marker);
        if(Math.abs(marker.x-race.cameraX)<600&&Math.abs(marker.y-race.cameraY)<400){
            c.save();c.translate((float)marker.x,(float)marker.y);c.rotate((float)Math.toDegrees(marker.heading));
            for(int y=-80;y<80;y+=16)for(int x=-12;x<12;x+=12)rect(c,x,y,x+12,y+16,0,((y+80)/16+(x+12)/12)%2==0?CREAM:NAVY);
            c.restore();
        }
        for(int r=0;r<race.ramps.length;r++){
            race.track.at(race.ramps[r],marker);
            if(Math.abs(marker.x-race.cameraX)>600||Math.abs(marker.y-race.cameraY)>400)continue;
            c.save();c.translate((float)marker.x,(float)marker.y);c.rotate((float)Math.toDegrees(marker.heading));
            c.translate(0,(float)race.rampLane[r]);c.scale(1,(float)race.rampHalfWidth[r]/66);
            rect(c,-94,-69,12,72,8,0x44000000);
            rect(c,-90,-66,7,66,5,0xff624740);rect(c,-88,-62,0,62,4,0xffc59a60);p.setShader(rampLight);box.set(-88,-62,0,62);c.drawRoundRect(box,4,4,p);p.setShader(null);
            for(int x=-80;x<0;x+=17)rect(c,x,-60,x+3,60,0,0xffe6c48d);
            p.setColor(0xff6a5442);for(int bolt=-78;bolt<0;bolt+=24){c.drawCircle(bolt,-52,2.5f,p);c.drawCircle(bolt,52,2.5f,p);}
            rect(c,-90,-66,0,-57,1,GOLD);rect(c,-90,57,0,66,1,GOLD);
            p.setStyle(Paint.Style.STROKE);p.setColor(CREAM);p.setStrokeWidth(6);
            c.drawLine(-58,-24,-33,0,p);c.drawLine(-33,0,-58,24,p);c.drawLine(-32,-24,-7,0,p);c.drawLine(-7,0,-32,24,p);p.setStyle(Paint.Style.FILL);
            c.restore();
        }
        for(int i=0;i<race.padDistance.length;i++){
            race.track.at(race.padDistance[i],marker);
            if(Math.abs(marker.x-race.cameraX)>600||Math.abs(marker.y-race.cameraY)>400)continue;
            c.save();c.translate((float)marker.x,(float)marker.y);c.rotate((float)Math.toDegrees(marker.heading));c.translate(0,(float)race.padLane[i]);
            rect(c,-45,-33,45,33,10,0x443cfff2);rect(c,-40,-24,43,33,7,0x55000000);
            rect(c,-40,-28,40,28,7,0xff123a4b);rect(c,-37,-25,37,25,5,0xff29aeba);
            p.setStyle(Paint.Style.STROKE);p.setStrokeWidth(5);p.setColor(0xffd1fff2);p.setAlpha((int)(210+45*Math.sin(race.elapsed*6)));
            for(int x=-26;x<=18;x+=22){c.drawLine(x,-16,x+12,0,p);c.drawLine(x+12,0,x,16,p);}
            p.setAlpha(255);p.setStyle(Paint.Style.FILL);c.restore();
        }
    }
    void kart(Canvas c,RaceModel.Car car,int character,int color,int number,boolean paused) {
        float x=(float)car.x,y=(float)car.y,h=(float)car.height();
        if(car.fallTime>0){
            float t=(float)(1-car.fallTime/RaceModel.FALL_SECONDS),scale=Math.max(.05f,1-t*t);
            c.save();c.translate(x,y+t*t*75);c.rotate((float)Math.toDegrees(car.heading)+90+t*160);c.scale(scale,scale);
            box.set(-34,-34,34,34);p.setAlpha((int)(255*(1-t*.65)));c.drawBitmap(overhead[character],null,box,p);p.setAlpha(255);c.restore();
            centre(c,"FALLING!",x,y-45,13,GOLD,true);return;
        }
        c.save();c.translate(x,y);c.rotate((float)Math.toDegrees(car.heading));
        p.setColor(0x55000000);c.drawOval(-25,-19,25,19,p);
        if(car.boostTimer>0&&!paused){p.setColor(GOLD);c.drawOval(-50,-8,-18,8,p);p.setColor(CREAM);c.drawOval(-38,-4,-20,4,p);}
        p.setStyle(Paint.Style.STROKE);p.setStrokeWidth(2);p.setColor(color);c.drawOval(-29,-22,29,22,p);p.setStyle(Paint.Style.FILL);
        c.restore();
        c.save();c.translate(x,y-h*15);c.rotate((float)Math.toDegrees(car.heading+car.spinVisual)+90);float scale=1+h*.7f;c.scale(scale,scale);
        box.set(-34,-34,34,34);p.setAlpha(car.invulnerable>0&&((int)(car.invulnerable*12))%2==0?145:255);p.setFilterBitmap(true);
        c.drawBitmap(overhead[character],null,box,p);p.setAlpha(255);c.restore();
        rect(c,x-12,y-48-h*28,x+12,y-30-h*28,5,paused?0xffa85e63:NAVY);
        centre(c,""+number,x,y-34-h*28,13,color,true);
        if(car.spinTimer>0){p.setColor(CREAM);p.setStyle(Paint.Style.STROKE);p.setStrokeWidth(2);box.set(x-36,y-28,x+36,y+28);c.drawArc(box,(float)Math.toDegrees(car.spinVisual),230,false,p);p.setStyle(Paint.Style.FILL);}
        if(car.landing>0){p.setColor(GOLD);p.setStrokeWidth(3);p.setStyle(Paint.Style.STROKE);c.drawCircle(x,y,(float)(24+(1-car.landing/.45)*48),p);p.setStyle(Paint.Style.FILL);}
        if(car.bumpTimer>.15&&!paused){p.setColor(GOLD);p.setStrokeWidth(3);for(int i=0;i<6;i++){double a=i*Math.PI/3;c.drawLine(x+(float)Math.cos(a)*29,y+(float)Math.sin(a)*29,x+(float)Math.cos(a)*36,y+(float)Math.sin(a)*36,p);}}
    }
    void attack(Canvas c,RaceModel.Car car){
        if(car.oilSpray>0){
            c.save();c.translate((float)car.x,(float)car.y);c.rotate((float)Math.toDegrees(car.heading));
            rect(c,-30,-8,-20,8,3,0xff7994a1);
            for(int i=0;i<9;i++){
                double t=((.65-car.oilSpray)*2.8+i*.11)%1;
                float x=(float)(-28-t*65),y=(float)(Math.sin(i*2.1)*t*16);
                p.setColor(i%3==0?0xff637da1:0xff142536);c.drawCircle(x,y,(float)(2+t*4),p);
            }c.restore();
        }
        if(car.power==5&&car.attackTime==0){
            // Forward lane indicates the automatic punch corridor.
            p.setStyle(Paint.Style.STROKE);p.setStrokeWidth(1);p.setColor(0x335ed4dc);c.save();c.translate((float)car.x,(float)car.y);c.rotate((float)Math.toDegrees(car.heading));c.drawRect(25,-30,(float)RaceModel.GLOVE_RANGE,30,p);c.restore();p.setStyle(Paint.Style.FILL);
            c.save();c.translate((float)car.x,(float)car.y);c.rotate((float)Math.toDegrees(car.heading));glove(c,29,.7f);c.restore();
        }
        if(car.attackTime<=0)return;
        if(car.attackType==6){
            double t=1-car.attackTime/1.2,angle=car.heading+Math.PI*t;
            c.save();c.translate((float)car.x,(float)car.y);c.rotate((float)Math.toDegrees(angle));
            p.setStrokeWidth(10);p.setColor(0xff304858);c.drawLine(15,0,100,0,p);p.setStrokeWidth(5);p.setColor(0xffa7c8ce);c.drawLine(15,0,100,0,p);
            p.setStrokeWidth(8);p.setColor(GOLD);c.drawLine(92,0,113,-25,p);c.drawLine(113,-25,129,-16,p);c.drawLine(92,0,113,25,p);c.drawLine(113,25,129,16,p);c.restore();
        }else if(car.attackType==4){
            double age=RaceModel.MALLET_SECONDS-car.attackTime;
            double lift=age<.28?age/.28:age<.4?1:age<.48?1-(age-.4)/.08:age<.62?0:Math.sin((age-.62)/.43*Math.PI)*.18;
            float x=(float)(car.x+Math.cos(car.attackHeading)*72),groundY=(float)(car.y+Math.sin(car.attackHeading)*72),y=groundY-(float)lift*56;
            p.setColor(0x55000000);c.drawOval(x-27,groundY-18,x+27,groundY+18,p);
            p.setColor(0xff6e452b);p.setStrokeWidth(12);c.drawLine((float)car.x,(float)car.y,x,y,p);
            p.setColor(0xffd5a565);p.setStrokeWidth(7);c.drawLine((float)car.x,(float)car.y-2,x,y-2,p);
            c.save();c.translate(x,y);c.rotate((float)Math.toDegrees(car.attackHeading));float scale=(float)(1+lift*.55);c.scale(scale,scale);
            // End-on wooden striking face: concentric end grain, rim and shallow depth.
            p.setColor(0xff68432d);c.drawCircle(2,4,34,p);
            p.setColor(0xffe1b679);c.drawCircle(0,0,32,p);
            p.setColor(0xffd1a063);c.drawCircle(0,0,27,p);
            p.setStyle(Paint.Style.STROKE);p.setStrokeWidth(1.5f);p.setColor(0xffa67542);
            for(int radius=7;radius<=24;radius+=6){box.set(-radius,-radius,radius,radius);c.drawArc(box,25+radius,290,false,p);}
            c.drawLine(13,-24,9,-13,p);p.setStyle(Paint.Style.FILL);c.restore();
            if(age>=.48&&age<.78){float t=(float)((age-.48)/.3);p.setColor(GOLD);p.setStrokeWidth(3);p.setStyle(Paint.Style.STROKE);c.drawCircle(x,groundY,25+t*50,p);p.setStyle(Paint.Style.FILL);
                for(int i=0;i<8;i++){double a=i*Math.PI/4;float dx=(float)Math.cos(a)*(28+t*45),dy=(float)Math.sin(a)*(28+t*45);rect(c,x+dx-3,groundY+dy-3,x+dx+3,groundY+dy+3,1,0xffe1b679);}}
        }else{
            c.save();c.translate((float)car.x,(float)car.y);c.rotate((float)Math.toDegrees(car.attackHeading));
            float reach=(float)RaceModel.gloveReach(car);
            rect(c,10,-12,31,12,4,0xff587b8d);
            p.setColor(NAVY);p.setStrokeWidth(6);
            for(int pass=0;pass<2;pass++){if(pass==1){p.setColor(0xffd2e3e4);p.setStrokeWidth(3);}
                for(int i=0;i<12;i++)c.drawLine(24+(reach-24)*i/12,i%2==0?-9:9,24+(reach-24)*(i+1)/12,i%2==0?9:-9,p);}
            glove(c,reach,1);c.restore();
        }
    }
    void themedObstacle(Canvas c,Track.Obstacle o,double time){
        float w=(float)o.halfW,h=(float)o.halfH;
        if(o.type==4){ // drinking glass, seen from above
            p.setColor(0x55000000);c.drawCircle(6,7,w,p);p.setColor(0xffd0e6df);c.drawCircle(0,0,w,p);p.setColor(0xff6094a0);c.drawCircle(0,0,w-7,p);p.setColor(0xffa3c6ce);c.drawCircle(-10,-8,w-19,p);
            p.setStyle(Paint.Style.STROKE);p.setStrokeWidth(4);p.setColor(CREAM);box.set(-w+4,-w+4,w-4,w-4);c.drawArc(box,190,115,false,p);p.setStyle(Paint.Style.FILL);
        }else if(o.type==5){ // sandwich on a plate
            p.setColor(0xffe6dfcc);c.drawCircle(0,0,w,p);rect(c,-35,-35,35,35,8,0xffb78045);rect(c,-31,-31,31,31,5,0xffe8c68a);
            p.setStrokeWidth(5);p.setColor(0xff75a649);c.drawLine(-31,28,30,-29,p);p.setColor(0xffc86046);c.drawLine(-26,31,32,-24,p);
        }else if(o.type==6){
            rect(c,-w,-h,w,h,3,0xffe2bb63);p.setStrokeWidth(2);p.setColor(0xff694936);
            for(int x=-95;x<100;x+=10)c.drawLine(x,-h,x,x%20==5?3:-5,p);
        }else if(o.type==10){
            rect(c,-w,-h,w-18,h,12,0xffc99a62);rect(c,-w+8,-h+4,w-20,-h+7,2,0xfff1cf8a);p.setColor(0xffe4ba7e);c.drawOval(w-30,-h,w,h,p);
        }else if(o.type==7){
            p.setColor(0x44000000);c.drawCircle(5,7,w,p);p.setColor(0xffe79756);c.drawCircle(0,0,w,p);
            p.setStyle(Paint.Style.STROKE);p.setStrokeWidth(4);p.setColor(0xff9b5537);c.drawLine(-w,0,w,0,p);c.drawLine(0,-w,0,w,p);box.set(-w/2,-w,w/2,w);c.drawOval(box,p);p.setStyle(Paint.Style.FILL);
            p.setColor(0x55ffffff);c.drawOval(-29,-34,-6,-15,p);
        }else if(o.type==8){
            p.setStrokeWidth(4);p.setColor(0xff203d37);
            for(int i=-1;i<=1;i++){float wiggle=(float)Math.sin(time*8+i)*4;c.drawLine(i*15,-12,i*17+wiggle,-30,p);c.drawLine(i*15,12,i*17-wiggle,30,p);}
            p.setColor(0xffda6553);c.drawOval(-w,-22,w,22,p);p.setColor(0xff263b38);c.drawCircle(w-7,0,13,p);c.drawLine(-w,0,w-14,0,p);
            for(int i=-1;i<=1;i++){c.drawCircle(i*13-5,-11,4,p);c.drawCircle(i*13-5,11,4,p);}
        }else{
            p.setColor(0xff32563c);c.drawCircle(0,0,w,p);
            for(int i=0;i<6;i++){double a=i*Math.PI/3;p.setColor(0xffefb7bb);c.drawCircle((float)Math.cos(a)*26,(float)Math.sin(a)*26,21,p);}
            p.setColor(GOLD);c.drawCircle(0,0,19,p);
        }
    }
    void glove(Canvas c,float reach,float scale){
        c.save();c.translate(reach,0);c.scale(scale,scale);
        rect(c,-23,-18,-10,18,4,CREAM);rect(c,-15,-24,24,21,13,0xff842e46);
        rect(c,-14,-24,23,16,12,0xffe66076);rect(c,-8,-19,17,-9,6,0xffffa9b1);
        rect(c,-19,9,0,27,8,0xffc64562);rect(c,-14,12,-3,23,4,0xffed7f8e);c.restore();
    }
    void pickup(Canvas c,float x,float y) {
        rect(c,x-14,y-12,x+16,y+17,5,0x66000000);
        rect(c,x-16,y-16,x+16,y+16,5,GOLD);
        rect(c,x-3,y-16,x+3,y+16,1,0xffcf767d);rect(c,x-16,y-3,x+16,y+3,1,0xffcf767d);
    }
    void hazard(Canvas c,RaceModel.Hazard h) {
        float x=(float)h.x,y=(float)h.y;
        if(h.type==2){p.setColor(0xffee9197);c.drawCircle(x,y,11,p);p.setColor(CREAM);c.drawCircle(x-3,y-4,4,p);}
        else{p.setColor(0xdd142536);c.drawOval(x-38,y-27,x+38,y+27,p);p.setColor(0xff5d698c);c.drawOval(x-23,y-16,x+19,y+5,p);p.setColor(0xff709794);c.drawOval(x-10,y-11,x+10,y-6,p);}
    }
}
