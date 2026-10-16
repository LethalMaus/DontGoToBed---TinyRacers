package dev.jamescullimore.tinyracers.spike;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.res.AssetFileDescriptor;
import android.media.*;
import android.os.SystemClock;
import android.view.ViewGroup;
import android.widget.*;

/** Bundled offline music and rate-limited effects. Owns and releases all audio resources. */
final class GameAudio implements AudioManager.OnAudioFocusChangeListener {
    private final Activity activity;
    private final AudioManager manager;
    private final SharedPreferences prefs;
    private final SoundPool effects;
    private final MediaPlayer[] music=new MediaPlayer[2];
    private final boolean[] prepared=new boolean[2];
    private final int[] sounds=new int[7];
    private final boolean[] loaded=new boolean[7];
    private final long[] lastSound=new long[7];
    private final double[] previousJump=new double[4],previousBump=new double[4],previousFall=new double[4],previousBoom=new double[4],previousAttack=new double[4],previousSpray=new double[4],previousLand=new double[4],previousSpin=new double[4];
    private final int[] previousPower=new int[4];
    private RaceModel observed;
    private int previousRound,previousCount=-1;
    private boolean wasComplete,active,focused,released;
    private double previousBreak;
    private float musicVolume,effectsVolume,gain;
    private int playing=-1;
    private long lastUpdate;
    private final UiStrings strings;
    GameAudio(Activity activity,UiStrings strings){
        this.strings=strings;
        this.activity=activity;manager=(AudioManager)activity.getSystemService(Context.AUDIO_SERVICE);
        prefs=activity.getSharedPreferences("audio",Context.MODE_PRIVATE);
        musicVolume=prefs.getFloat("music",.28f);effectsVolume=prefs.getFloat("effects",.65f);
        AudioAttributes attributes=new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_GAME).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build();
        effects=new SoundPool.Builder().setMaxStreams(8).setAudioAttributes(attributes).build();
        effects.setOnLoadCompleteListener((pool,id,status)->{for(int i=0;i<sounds.length;i++)if(sounds[i]==id){loaded[i]=status==0;if(status!=0)android.util.Log.w("TinyRacersAudio","Effect load failed: "+i);}});
        String[] names={"jump","hit","place","arrow","damage_taken","drink","turn"};
        for(int i=0;i<names.length;i++)try(AssetFileDescriptor fd=activity.getAssets().openFd("audio/"+names[i]+".mp3")){sounds[i]=effects.load(fd,1);}catch(Exception e){android.util.Log.w("TinyRacersAudio","Missing effect "+names[i],e);}
        for(int i=0;i<2;i++){
            final int index=i;
            try(AssetFileDescriptor fd=activity.getAssets().openFd("audio/"+(i==0?"menu":"panic")+".mp3")){
                MediaPlayer player=new MediaPlayer();music[i]=player;
                player.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_GAME).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build());
                player.setDataSource(fd.getFileDescriptor(),fd.getStartOffset(),fd.getLength());player.setLooping(true);player.setVolume(0,0);
                player.setOnPreparedListener(mp->{if(!released){prepared[index]=true;android.util.Log.i("TinyRacersAudio","Music ready: "+index);}});
                player.setOnErrorListener((mp,what,extra)->{prepared[index]=false;android.util.Log.w("TinyRacersAudio","Music error "+what);return true;});player.prepareAsync();
            }catch(Exception e){android.util.Log.w("TinyRacersAudio","Missing music",e);}
        }
    }
    void resume(){active=true;focused=manager.requestAudioFocus(this,AudioManager.STREAM_MUSIC,AudioManager.AUDIOFOCUS_GAIN)==AudioManager.AUDIOFOCUS_REQUEST_GRANTED;lastUpdate=0;}
    void pause(){active=false;silence();manager.abandonAudioFocus(this);focused=false;}
    private void silence(){for(int i=0;i<2;i++)if(prepared[i]&&music[i].isPlaying())music[i].pause();effects.autoPause();}
    @Override public void onAudioFocusChange(int focus){focused=focus==AudioManager.AUDIOFOCUS_GAIN;if(!focused)silence();}
    private void sound(int type,float rate){
        long now=SystemClock.elapsedRealtime();if(!active||!focused||effectsVolume==0||!loaded[type]||now-lastSound[type]<(type==1?180:100))return;
        lastSound[type]=now;effects.play(sounds[type],effectsVolume,effectsVolume,1,0,rate);
    }
    void tick(RaceModel race){
        if(released||!active||!focused)return;
        long now=SystemClock.elapsedRealtime();float dt=lastUpdate==0?.016f:Math.min(.1f,(now-lastUpdate)/1000f);lastUpdate=now;
        int wanted=race!=null&&!race.complete()?1:0;
        if(playing!=wanted){gain=Math.max(0,gain-dt*2);if(playing<0||gain==0){if(playing>=0&&prepared[playing])music[playing].pause();playing=wanted;}}
        else gain=Math.min(1,gain+dt);
        for(int i=0;i<2;i++)if(prepared[i]){
            MediaPlayer mp=music[i];float level=i==playing?musicVolume*gain:0;mp.setVolume(level,level);
            if(i==playing&&level>0&&!mp.isPlaying())mp.start();else if(level==0&&mp.isPlaying())mp.pause();
        }
        if(race!=observed){observed=race;previousRound=0;previousCount=-1;previousBreak=0;wasComplete=false;clearEvents();}
        if(race==null)return;
        if(race.round!=previousRound){previousRound=race.round;previousCount=-1;clearEvents();}
        int count=(int)Math.ceil(race.countdown);
        if(count!=previousCount){if(count>0)sound(6,1);else if(previousCount>0)sound(2,1.4f);previousCount=count;}
        if(race.roundBreak>0&&previousBreak==0&&race.roundWinner>=0)sound(2,1.1f);previousBreak=race.roundBreak;
        if(race.complete()&&!wasComplete){sound(2,1.2f);wasComplete=true;}
        for(int i=0;i<4;i++){
            RaceModel.Car c=race.cars[i];if(c==null)continue;
            if(c.jumpTime>previousJump[i]+.1)sound(0,1.1f);
            if(c.landing>previousLand[i]+.1)sound(1,.8f);
            if(c.bumpTimer>previousBump[i]+.1)sound(1,1);
            if(c.fallTime>previousFall[i]+.1)sound(0,.55f);
            if(c.explosion>previousBoom[i]+.1)sound(4,.65f);
            if(c.oilSpray>previousSpray[i]+.1)sound(5,.8f);
            if(c.spinTimer>previousSpin[i]+.1)sound(6,.6f);
            if(c.power>0&&previousPower[i]==0)sound(2,1.25f);
            if(c.power==0&&previousPower[i]>0&&c.place==0&&race.roundBreak==0){if(previousPower[i]==1)sound(0,1.5f);else if(previousPower[i]==2)sound(3,1.2f);}
            if(c.attackTime>previousAttack[i]+.1)sound(3,c.attackType==4?.65f:1.4f);
            if(c.attackType==4&&previousAttack[i]>.57&&c.attackTime<=.57&&c.attackTime>0)sound(1,.65f);
            previousJump[i]=c.jumpTime;previousLand[i]=c.landing;previousBump[i]=c.bumpTimer;previousFall[i]=c.fallTime;previousBoom[i]=c.explosion;
            previousAttack[i]=c.attackTime;previousSpray[i]=c.oilSpray;previousSpin[i]=c.spinTimer;previousPower[i]=c.power;
        }
    }
    private void clearEvents(){for(double[] a:new double[][]{previousJump,previousBump,previousFall,previousBoom,previousAttack,previousSpray,previousLand,previousSpin})java.util.Arrays.fill(a,0);java.util.Arrays.fill(previousPower,0);}
    void settings(){
        LinearLayout panel=new LinearLayout(activity);panel.setOrientation(LinearLayout.VERTICAL);panel.setPadding(32,12,32,12);
        addSlider(panel,"Music",true);addSlider(panel,"Effects",false);
        TextView credit=new TextView(activity);credit.setText("Music: Liborio Conti — Upbeat Drums and original game menu music\nno-copyright-music.com\n\nEffects: Pixabay, reused from Don’t Go To Bed\npixabay.com/sound-effects/\n\nAudio plays locally on the TV.");panel.addView(credit);
        new AlertDialog.Builder(activity).setTitle(strings.t("Sound & music")).setView(panel).setPositiveButton(strings.t("Done"),null).show();
    }
    private void addSlider(LinearLayout panel,String name,boolean isMusic){
        TextView label=new TextView(activity);panel.addView(label);SeekBar slider=new SeekBar(activity);slider.setMax(100);slider.setProgress(Math.round((isMusic?musicVolume:effectsVolume)*100));label.setText(strings.t(name)+": "+slider.getProgress()+"%");panel.addView(slider,new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,ViewGroup.LayoutParams.WRAP_CONTENT));
        slider.setContentDescription(name+" volume");slider.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener(){
            public void onProgressChanged(SeekBar bar,int value,boolean user){label.setText(strings.t(name)+": "+value+"%");if(isMusic)musicVolume=value/100f;else{effectsVolume=value/100f;if(value==0)effects.autoPause();}prefs.edit().putFloat(isMusic?"music":"effects",value/100f).apply();}
            public void onStartTrackingTouch(SeekBar bar){} public void onStopTrackingTouch(SeekBar bar){}
        });
    }
    void close(){if(released)return;pause();released=true;effects.release();for(MediaPlayer mp:music)if(mp!=null)mp.release();}
}
