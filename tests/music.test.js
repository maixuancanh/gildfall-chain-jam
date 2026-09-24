import test from 'node:test';
import assert from 'node:assert/strict';
import { createMusicPlayer } from '../src/music.js';
const setup=()=>{
  const tracks=Array.from({length:4},()=>({currentTime:0,volume:1,paused:true,play(){this.paused=false;return Promise.resolve();},pause(){this.paused=true;}}));
  const player=createMusicPlayer({random:()=>0});
  player.setTracks(tracks);return {tracks,player};
};
test('menu music waits for gesture, loops and is replaced by non-looping run music',()=>{
  const {tracks,player}=setup();player.start({loop:true});
  assert.equal(tracks[0].loop,true);assert.ok(tracks.every(t=>t.paused));
  player.unlock();assert.equal(tracks[0].paused,false);
  player.start();assert.equal(tracks[0].paused,true);assert.equal(tracks[1].loop,false);
});
test('start waits for unlock, retry avoids previous selection',()=>{
  const {tracks,player}=setup();player.start();assert.ok(tracks.every(t=>t.paused));
  player.unlock();assert.equal(tracks[0].paused,false);
  player.start();assert.equal(tracks[0].paused,true);assert.equal(tracks[1].paused,false);
});
test('pause preserves offset and mute only affects volume',()=>{
  const {tracks,player}=setup();player.unlock();player.start();tracks[0].currentTime=12;
  player.setPaused(true);assert.equal(tracks[0].paused,true);assert.equal(tracks[0].currentTime,12);
  player.setPaused(false);assert.equal(tracks[0].paused,false);assert.equal(tracks[0].currentTime,12);
  player.setVolume(0);assert.equal(tracks[0].volume,0);assert.equal(tracks[0].currentTime,12);
});
test('terminal fades once over half second and retry cancels old fade',()=>{
  const {tracks,player}=setup();player.unlock();player.start();player.tick(1000,true);
  player.tick(1250,true);assert.equal(tracks[0].volume,.10);
  player.tick(1500,true);assert.equal(tracks[0].paused,true);
  player.start();player.tick(1600,false);assert.equal(tracks[1].paused,false);assert.equal(tracks[1].loop,false);
});
