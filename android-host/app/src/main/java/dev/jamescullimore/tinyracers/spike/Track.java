package dev.jamescullimore.tinyracers.spike;

/** One closed bedroom circuit, sampled once. Distances are world units. */
final class Track {
    static final int COUNT=960;
    static final double HALF_WIDTH=88, TABLE_HALF_WIDTH=280;
    static final String[] NAMES={"Dining Table","Garden","Bedroom"};
    final int theme; final double minX,maxX,minY,maxY;
    final Obstacle[] obstacles;
    final java.util.List<Shortcut> shortcuts=new java.util.ArrayList<>();
    final java.util.List<Obstacle> hairpinBarriers=new java.util.ArrayList<>();
    static final class Shortcut {
        final double x1,y1,x2,y2,start,end,length;
        static final double HALF_WIDTH=43;
        Shortcut(Point a,Point b){x1=a.x;y1=a.y;x2=b.x;y2=b.y;start=a.distance;end=b.distance;length=Math.hypot(x2-x1,y2-y1);}
    }
    static final class Obstacle {
        final double x,y,heading,halfW,halfH; final int type;
        Obstacle(double x,double y,double heading,int type){this.x=x;this.y=y;this.heading=heading;this.type=type;
            halfW=type==0?75:type==1?48:type==2||type==6||type==10?105:type==8?32:52;halfH=type==0?48:type==1?48:type==2||type==6||type==10?15:type==8?32:52;}
    }
    final double[] x=new double[COUNT+1],y=new double[COUNT+1],s=new double[COUNT+1];
    final double length;
    static final class Point { double x,y,heading,distance,lateral; boolean shortcut; }
    Track(){this(2);}
    Track(int theme) {
        this.theme=theme;
        double[][] knots={{0,0},{900,-400},{2400,-400},{2660,-180},{2400,40},{1300,40},{1040,260},{1300,480},{2800,480},{3060,700},{2800,920},{1700,920},{1500,1300},{2500,1600},{3700,1400},{4500,700},{5500,500},{5900,1400},{5100,2000},{5900,2500},{7000,2100},{7700,2900},{7400,3900},{6500,4300},{5700,3800},{5100,4600},{4100,5100},{3300,4400},{2500,5100},{1600,4600},{700,5200},{-300,4700},{-1300,5000},{-2200,4100},{-1700,3200},{-2400,2300},{-1900,1400},{-1100,1600},{-1200,600}};
        if(theme==0){knots=new double[32][2];for(int i=0;i<32;i++){double angle=i*Math.PI/16;
            double inset=(i%8==3||i%8==4||i%8==5)?(i%8==4?.78:.91):1;
            knots[i][0]=Math.cos(angle)*3300*inset;knots[i][1]=Math.sin(angle)*1900*inset;
        }}
        if(theme==1)knots=new double[][]{{0,0},{1100,-700},{2400,-300},{3300,-1000},{4700,-300},{5200,900},{4400,1900},{5600,2900},{5300,4200},{3900,4600},{2800,3800},{1700,4900},{300,4500},{-800,3500},{-300,2300},{-1300,1400},{-1000,300}};
        for(int i=0;i<COUNT;i++){
            double u=(double)i/COUNT*knots.length;int k=(int)u;double t=u-k;
            for(int axis=0;axis<2;axis++){
                double a=knots[(k+knots.length-1)%knots.length][axis],b=knots[k][axis],c=knots[(k+1)%knots.length][axis],d=knots[(k+2)%knots.length][axis];
                double value=.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t);
                if(axis==0)x[i]=value;else y[i]=value;
            }
        }
        x[COUNT]=x[0];y[COUNT]=y[0];
        double total=0;for(int i=1;i<=COUNT;i++)total+=Math.hypot(x[i]-x[i-1],y[i]-y[i-1]);
        double scale=(theme==1?42000:45000)/total;
        for(int i=0;i<=COUNT;i++){x[i]*=scale;y[i]*=scale;if(i>0)s[i]=s[i-1]+Math.hypot(x[i]-x[i-1],y[i]-y[i-1]);}
        length=s[COUNT];
        double lx=Double.MAX_VALUE,ly=Double.MAX_VALUE,hx=-Double.MAX_VALUE,hy=-Double.MAX_VALUE;
        for(int i=0;i<COUNT;i++){lx=Math.min(lx,x[i]);hx=Math.max(hx,x[i]);ly=Math.min(ly,y[i]);hy=Math.max(hy,y[i]);}
        // An ellipse inscribed in the centreline bounding box cuts inside its
        // curved road shoulders. Leave room for the whole road and a narrow verge.
        double margin=theme==0?220:112;
        minX=lx-margin;maxX=hx+margin;minY=ly-margin;maxY=hy+margin;
        if(theme==2){
            // Small corner cuts, separate from the protected hairpin complex.
            addShortcut(2500*scale,5100*scale,360);
            addShortcut(-2200*scale,4100*scale,360);
        }
        Point p=new Point(),clearance=new Point();
        java.util.List<Obstacle> props=new java.util.ArrayList<>();
        for(int i=0;i<112;i++){
            at(350+i*(length-700)/112,p);double lane=(i%2==0?1:-1)*(175+(i%3)*22);
            int type=theme==0?new int[]{0,4,2,5,6}[i%5]:theme==1?new int[]{7,8,9,7,8}[i%5]:new int[]{0,1,10,1,3}[i%5];
            double ox=p.x-Math.sin(p.heading)*lane,oy=p.y+Math.cos(p.heading)*lane;
            if(theme==0&&(ellipseRadius(ox,oy)>.94)){ox=p.x+Math.sin(p.heading)*lane;oy=p.y-Math.cos(p.heading)*lane;}
            Obstacle o=new Obstacle(ox,oy,p.heading,type);
            nearest(ox,oy,clearance);
            if(theme!=2||Math.hypot(ox-clearance.x,oy-clearance.y)>Math.hypot(o.halfW,o.halfH)+(clearance.shortcut?Shortcut.HALF_WIDTH:HALF_WIDTH)+12)props.add(o);
        }
        if(theme==2){
            // Continuous LEGO islands between the parallel legs. No gaps to cut through.
            addBrickWall(props,1450,2300,-180,scale);
            addBrickWall(props,1450,2200,260,scale);
            addBrickWall(props,1850,2640,700,scale);
        }
        obstacles=props.toArray(new Obstacle[0]);
    }
    private void addBrickWall(java.util.List<Obstacle> props,double from,double to,double y,double scale){
        double a=from*scale,b=to*scale;
        int count=(int)Math.ceil((b-a)/85);
        for(int i=0;i<=count;i++){Obstacle o=new Obstacle(a+(b-a)*i/count,y*scale,0,1);props.add(o);hairpinBarriers.add(o);}
    }
    private void addShortcut(double x,double y,double halfArc){
        Point centre=new Point(),a=new Point(),b=new Point();nearest(x,y,centre);
        at(centre.distance-halfArc,a);at(centre.distance+halfArc,b);
        if(b.distance>a.distance)shortcuts.add(new Shortcut(a,b));
    }

    double ellipseRadius(double px,double py){return Math.hypot((px-(minX+maxX)/2)/((maxX-minX)/2),(py-(minY+maxY)/2)/((maxY-minY)/2));}
    boolean outside(double px,double py,Point nearest){
        if(theme==0)return ellipseRadius(px,py)>1;
        // The floor is the UNION of the main course and shortcut boards. A
        // nearer shortcut must never shrink the floor underneath the main road.
        for(int i=0;i<COUNT;i++)if(segmentDistance(px,py,x[i],y[i],x[i+1],y[i+1])<=TABLE_HALF_WIDTH)return false;
        for(Shortcut cut:shortcuts)if(segmentDistance(px,py,cut.x1,cut.y1,cut.x2,cut.y2)<=Shortcut.HALF_WIDTH+7)return false;
        return true;
    }
    private static double segmentDistance(double px,double py,double ax,double ay,double bx,double by){
        double dx=bx-ax,dy=by-ay,len=dx*dx+dy*dy;
        double t=len==0?0:Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/len));
        return Math.hypot(px-ax-t*dx,py-ay-t*dy);
    }
    static boolean roundObstacle(int type){return type==3||type==4||type==7||type==8||type==9;}
    void at(double distance,Point out) {
        double d=(distance%length+length)%length;
        int lo=0,hi=COUNT-1;while(lo<hi){int mid=(lo+hi+1)/2;if(s[mid]<=d)lo=mid;else hi=mid-1;}
        double t=(d-s[lo])/(s[lo+1]-s[lo]);
        out.x=x[lo]+(x[lo+1]-x[lo])*t;out.y=y[lo]+(y[lo+1]-y[lo])*t;
        out.heading=Math.atan2(y[lo+1]-y[lo],x[lo+1]-x[lo]);out.distance=d;out.lateral=0;out.shortcut=false;
    }
    void nearest(double px,double py,Point out) {
        double best=Double.MAX_VALUE;out.shortcut=false;
        for(int i=0;i<COUNT;i++){
            double dx=x[i+1]-x[i],dy=y[i+1]-y[i],len2=dx*dx+dy*dy;
            double t=Math.max(0,Math.min(1,((px-x[i])*dx+(py-y[i])*dy)/len2));
            double qx=x[i]+dx*t,qy=y[i]+dy*t,dist2=(px-qx)*(px-qx)+(py-qy)*(py-qy);
            if(dist2<best){best=dist2;out.x=qx;out.y=qy;out.heading=Math.atan2(dy,dx);out.distance=s[i]+Math.sqrt(len2)*t;out.lateral=((px-qx)*-dy+(py-qy)*dx)/Math.sqrt(len2);}
        }
        for(Shortcut cut:shortcuts){
            double dx=cut.x2-cut.x1,dy=cut.y2-cut.y1;
            double t=Math.max(0,Math.min(1,((px-cut.x1)*dx+(py-cut.y1)*dy)/(cut.length*cut.length)));
            double qx=cut.x1+dx*t,qy=cut.y1+dy*t,dist2=(px-qx)*(px-qx)+(py-qy)*(py-qy);
            if(dist2<best){best=dist2;out.x=qx;out.y=qy;out.heading=Math.atan2(dy,dx);out.distance=cut.start+(cut.end-cut.start)*t;out.lateral=((px-qx)*-dy+(py-qy)*dx)/cut.length;out.shortcut=true;}
        }
    }
}
