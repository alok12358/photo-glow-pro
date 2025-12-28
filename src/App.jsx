import BgWorker from './bgRemoval.worker.js?worker';
import React, { useState, useRef, useEffect, useMemo } from 'react';
// FIX: Added 'Sparkles' and 'CheckCircle' to imports to prevent Blank Screen
import {
  Upload, X, Wand2, Sliders, Scissors, Loader2,
  Music, Play, Pause, Search, Disc, Volume2, Video, CheckCircle, Zap, Sparkles
} from 'lucide-react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import './App.css';

// --- FIXED SONG LIBRARY (These links allow Video Creation) ---
const SONG_LIBRARY = [
  { id: 1, title: "Sunny Day", artist: "Benjamin Tissot", category: "Trending", url: "https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3" },
  { id: 2, title: "Slow Motion", artist: "Bensound", category: "Lo-Fi", url: "https://cdn.pixabay.com/download/audio/2022/03/10/audio_5b33d02a93.mp3" },
  { id: 3, title: "Energy", artist: "Bensound", category: "Bollywood", url: "https://cdn.pixabay.com/download/audio/2022/10/25/audio_273e32a614.mp3" },
  { id: 4, title: "Dubstep", artist: "Bensound", category: "Trending", url: "https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a73467.mp3" },
  { id: 5, title: "Desi Beat", artist: "Local Artist", category: "Bhojpuri", url: "https://cdn.pixabay.com/download/audio/2022/01/26/audio_d0c6ff1e65.mp3" },
];
const CATEGORIES = ["All", "Trending", "Bhojpuri", "Bollywood", "Lo-Fi"];

const App = () => {
  const [image, setImage] = useState(null);
  const [originalImage, setOriginalImage] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [notification, setNotification] = useState(null);
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);

  // Music State
  const [currentSong, setCurrentSong] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const audioRef = useRef(new Audio());

  const [filters, setFilters] = useState({ brightness: 100, contrast: 100, saturation: 100, blur: 0 });

  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const ffmpegRef = useRef(new FFmpeg());
  const workerRef = useRef(null);

  useEffect(() => {
    loadFFmpeg();
    // Initialize Background Removal Worker
    workerRef.current = new Worker(new URL('./bgRemoval.worker.js', import.meta.url), { type: 'module' });
    workerRef.current.onmessage = (e) => {
      setIsProcessing(false);
      if (e.data.success) {
        const url = URL.createObjectURL(e.data.blob);
        setImage(url);
        showToast("Background Removed Successfully!");
      } else { alert("Could not remove background."); }
    };
    return () => workerRef.current?.terminate();
  }, []);

  const loadFFmpeg = async () => {
    const ffmpeg = ffmpegRef.current;
    ffmpeg.on('log', ({ message }) => console.log(message));
    try {
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.4/dist/esm';
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });
      setFfmpegLoaded(true);
      console.log("Video Engine Ready");
    } catch (error) { console.error("FFmpeg error:", error); }
  };

  const showToast = (msg) => { setNotification(msg); setTimeout(() => setNotification(null), 3000); };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onload = (event) => {
        setImage(event.target.result);
        setOriginalImage(event.target.result);
        setFilters({ brightness: 100, contrast: 100, saturation: 100, blur: 0 });
      };
      reader.readAsDataURL(file);
    }
  };

  const removeBg = () => { if (!imageFile) return; setIsProcessing(true); setLoadingMessage("Removing Background (AI)..."); workerRef.current.postMessage({ imageBlob: imageFile, config: { publicPath: '/public/imgly-models/' } }); };
  const applyPreset = () => { setFilters({ brightness: 110, contrast: 115, saturation: 120, blur: 0 }); showToast("Auto Enhanced!"); };

  const handlePlaySong = (song) => {
    if (currentSong?.id === song.id) {
      isPlaying ? audioRef.current.pause() : audioRef.current.play();
      setIsPlaying(!isPlaying);
    } else {
      // Add crossOrigin to allow video recording of this audio
      audioRef.current.crossOrigin = "anonymous";
      audioRef.current.src = song.url;
      audioRef.current.loop = true;
      audioRef.current.play();
      setCurrentSong(song);
      setIsPlaying(true);
    }
  };

  const filteredSongs = useMemo(() => {
    return SONG_LIBRARY.filter(song => {
      const matchesSearch = (song.title + song.artist).toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = activeCategory === "All" || song.category === activeCategory;
      return matchesSearch && matchesCategory;
    });
  }, [searchQuery, activeCategory]);

  const getProcessedCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.crossOrigin = "anonymous"; // Important for video
    img.src = image;
    return new Promise((resolve) => {
      img.onload = () => {
        canvas.width = img.width; canvas.height = img.height;
        ctx.filter = `brightness(${filters.brightness}%) contrast(${filters.contrast}%) saturate(${filters.saturation}%) blur(${filters.blur}px)`;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas);
      };
    });
  };

  const createVideoStatus = async () => {
    if (!currentSong) return alert("Select a song first!");
    if (!ffmpegLoaded) return alert("Video engine loading... wait 5s");

    setIsProcessing(true);
    setLoadingMessage("Creating Video... This takes about 10-15s");

    try {
      const ffmpeg = ffmpegRef.current;

      // 1. Get Image
      const canvas = await getProcessedCanvas();
      const imageBlob = await new Promise(r => canvas.toBlob(r, 'image/png'));

      // 2. Get Audio (Fetch with CORS mode)
      const audioResponse = await fetch(currentSong.url);
      const audioBlob = await audioResponse.blob();

      // 3. Write to FFmpeg
      await ffmpeg.writeFile('input.png', await fetchFile(imageBlob));
      await ffmpeg.writeFile('input.mp3', await fetchFile(audioBlob));

      // 4. Create Video
      await ffmpeg.exec([
        '-loop', '1', '-i', 'input.png', '-i', 'input.mp3',
        '-c:v', 'libx264', '-t', '15', '-pix_fmt', 'yuv420p',
        '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
        '-shortest', 'output.mp4'
      ]);

      // 5. Download
      const data = await ffmpeg.readFile('output.mp4');
      const videoUrl = URL.createObjectURL(new Blob([data.buffer], { type: 'video/mp4' }));
      const link = document.createElement('a');
      link.download = `Status_${Date.now()}.mp4`;
      link.href = videoUrl;
      link.click();
      showToast("Video Downloaded Successfully!");
    } catch (error) {
      console.error("VIDEO ERROR:", error);
      alert("Video creation failed. It might be blocked by the audio source.");
    }
    setIsProcessing(false);
  };

  const handleFilterChange = (e) => setFilters({ ...filters, [e.target.name]: e.target.value });

  return (
    <div className="app-container">
      {notification && <div className="toast-notification"><CheckCircle size={20} /> {notification}</div>}
      {isProcessing && <div className="loading-overlay"><Loader2 className="spinner" size={48} /><p>{loadingMessage}</p></div>}

      <header className="navbar">
        <div className="logo"><Sparkles className="icon-logo" size={24} /><span>PhotoGlow Pro</span></div>
        {image && (
          <div className="header-actions">
            {currentSong && isPlaying && (<div className="playing-indicator"><Disc className="spin-icon" size={16} /><span>{currentSong.title}</span><Volume2 size={14} className="pulse-icon" /></div>)}
            <button className="btn-close" onClick={() => setImage(null)}><X size={18} /> New Project</button>
          </div>
        )}
      </header>

      <main className="main-content">
        <div className="image-workspace centered-workspace">
          {!image ? (
            <div className="landing-content">
              <div className="landing-header">
                <h1>AI Photo & Video Studio</h1>
                <p>Enhance photos, remove backgrounds, and create music statuses instantly.</p>
              </div>

              <div className="upload-box prominent-upload" onClick={() => fileInputRef.current.click()}>
                <Upload size={64} className="upload-icon" />
                <h3>Click to Upload Photo</h3>
                <p>Supports JPG, PNG • Music Studio Included</p>
                <input type="file" ref={fileInputRef} hidden onChange={handleImageUpload} accept="image/*" />
              </div>

              <div className="feature-row">
                <div className="feature"><Wand2 size={20} /> AI Enhance</div>
                <div className="feature"><Scissors size={20} /> BG Remover</div>
                <div className="feature"><Music size={20} /> Music Studio</div>
                <div className="feature"><Video size={20} /> Video Status</div>
              </div>
            </div>
          ) : (
            <div className="comparison-container">
              <div className="comparison-wrapper">
                <img src={image} className="img-enhanced" style={{ filter: `brightness(${filters.brightness}%) contrast(${filters.contrast}%) saturate(${filters.saturation}%) blur(${filters.blur}px)` }} />

                <div className="img-original-wrapper" style={{ width: `${sliderPosition}%` }}>
                  <img src={originalImage} />
                  {/* LABELS FOR SLIDER */}
                  <span className="label label-original">Original</span>
                </div>

                <input id="comparison-slider" type="range" min="0" max="100" value={sliderPosition} onChange={(e) => setSliderPosition(e.target.value)} />
                <div className="slider-line" style={{ left: `${sliderPosition}%` }}>
                  <div className="slider-button"><Sliders size={14} color="#222" /></div>
                </div>
                <span className="label label-enhanced">Enhanced</span>
              </div>
            </div>
          )}
        </div>

        {image && (
          <aside className="sidebar">
            <div className="sidebar-section music-section">
              <h3><Music size={18} /> Music Studio</h3>
              <div className="search-bar"><Search size={16} className="search-icon" /><input type="text" placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} /></div>
              <div className="category-scroll">{CATEGORIES.map(cat => (<button key={cat} className={`cat-chip ${activeCategory === cat ? 'active' : ''}`} onClick={() => setActiveCategory(cat)}>{cat}</button>))}</div>
              <div className="music-list">{filteredSongs.map((song) => (<div key={song.id} className={`music-item ${currentSong?.id === song.id ? 'active' : ''}`} onClick={() => handlePlaySong(song)}><div className="music-cover"><Disc size={20} /></div><div className="music-info"><span className="music-title">{song.title}</span><span className="music-artist">{song.artist}</span></div><div className="music-action">{currentSong?.id === song.id && isPlaying ? <Pause size={16} fill="white" /> : <Play size={16} fill="white" />}</div></div>))}</div>
            </div>
            <div className="sidebar-section highlight-section">
              <h3><Zap size={18} /> Smart AI Tools</h3>
              <div className="ai-buttons-grid"><button className="btn-ai btn-remove-bg" onClick={removeBg}><Scissors size={20} /> Remove BG</button><button className="btn-ai btn-auto-enhance" onClick={applyPreset}><Wand2 size={20} /> Auto Enhance</button></div>
            </div>
            <div className="sidebar-section">
              <h3><Sliders size={18} /> Adjustments</h3>
              <div className="control-group"><label>Brightness</label><input className="sidebar-slider" type="range" name="brightness" min="0" max="200" value={filters.brightness} onChange={handleFilterChange} /></div>
              <div className="control-group"><label>Contrast</label><input className="sidebar-slider" type="range" name="contrast" min="0" max="200" value={filters.contrast} onChange={handleFilterChange} /></div>
            </div>
            <div className="sidebar-footer">
              <button className={`btn-download primary ${!ffmpegLoaded ? 'disabled' : ''}`} onClick={createVideoStatus} disabled={!ffmpegLoaded || !currentSong}><Video size={20} /> {currentSong ? "Download Video Status" : "Select Song First"}</button>
            </div>
          </aside>
        )}
      </main>
      <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>
      <footer className="footer"><p>© {new Date().getFullYear()} Alok Patel. All rights reserved.</p></footer>
    </div>
  );
};

export default App;
