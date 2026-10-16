package dev.jamescullimore.tinyracers.spike;
public class SoloBotsCheck {
 static void ok(boolean value,String message){if(!value)throw new AssertionError(message);}
 public static void main(String[] args){
  Track.Point aim=new Track.Point();
  for(int theme=0;theme<3;theme++)for(int bots=0;bots<=3;bots++){
   boolean[] joined={true,bots>=1,bots>=2,bots>=3};
   RaceModel race=new RaceModel(joined,42,theme,1);
   double[] steering=new double[4];
   for(int i=0;i<4;i++)race.autoUse[i]=true;
   for(int n=0;n<60*600&&!race.complete();n++){
    for(int i=0;i<4;i++)if(joined[i])steering[i]=race.botSteering(i,aim);
    race.step(1.0/60,steering,joined);
   }
   ok(race.complete(),"Did not finish theme="+theme+" bots="+bots);
   ok(race.cars[0].place>0,"No human placement");
   System.out.printf("PASS %s solo + %d bots: %.1fs%n",Track.NAMES[theme],bots,race.elapsed);
  }
  RaceModel solo=new RaceModel(new boolean[]{true,false,false,false},42,0);
  solo.countdown=0;solo.cars[0].place=-1;solo.cars[0].health=0;
  for(int n=0;n<200;n++)solo.step(1.0/60,new double[4],new boolean[]{true,false,false,false});
  ok(solo.cars[0].place==0&&solo.roundBreak==0,"Solo knockout did not respawn");
  System.out.println("PASS solo knockout recovery without a second controller");
 }
}
