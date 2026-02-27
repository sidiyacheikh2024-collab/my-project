import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { GoogleGenAI } from "@google/genai";
import { 
  Send, 
  Image as ImageIcon, 
  Loader2, 
  Maximize2, 
  Terminal, 
  Cpu, 
  Zap,
  ChevronRight,
  History,
  Upload,
  Settings,
  X,
  FileVideo,
  Key,
  Github,
  Check,
  AlertCircle
} from "lucide-react";

// Types
interface Message {
  id: string;
  type: "user" | "ai";
  content: string;
  imageUrl?: string;
  timestamp: Date;
  isMediaAnalysis?: boolean;
  interpretation?: string;
}

type AspectRatio = "1:1" | "2:3" | "3:2" | "3:4" | "4:3" | "9:16" | "16:9" | "21:9";
type ImageSize = "1K" | "2K" | "4K";

export default function App() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("1:1");
  const [attachedFile, setAttachedFile] = useState<{ data: string; mimeType: string; name: string } | null>(null);
  const [showInterpretation, setShowInterpretation] = useState<string | null>(null);
  const [githubToken, setGithubToken] = useState("");
  const [githubRepo, setGithubRepo] = useState("my-project");
  const [githubOwner, setGithubOwner] = useState("sidiyacheikh2024-collab");
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // Simulated progress bar
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isLoading) {
      setLoadingProgress(0);
      interval = setInterval(() => {
        setLoadingProgress((prev) => {
          if (prev >= 95) return prev;
          return prev + Math.random() * 10;
        });
      }, 300);
    } else {
      setLoadingProgress(100);
    }
    return () => clearInterval(interval);
  }, [isLoading]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      const data = base64.split(",")[1];
      setAttachedFile({
        data,
        mimeType: file.type,
        name: file.name
      });
    };
    reader.readAsDataURL(file);
  };

  const handleSend = async () => {
    if ((!input.trim() && !attachedFile) || isLoading) return;
    
    const userMessage: Message = {
      id: Date.now().toString(),
      type: "user",
      content: input || (attachedFile ? `Analyzed ${attachedFile.name}` : ""),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    const currentInput = input;
    const currentFile = attachedFile;
    
    setInput("");
    setAttachedFile(null);
    setIsLoading(true);

    const fetchWithRetry = async (fn: () => Promise<any>, maxRetries = 3) => {
      for (let i = 0; i < maxRetries; i++) {
        try {
          return await fn();
        } catch (error: any) {
          const isRateLimit = error.message?.includes("429") || error.status === 429 || error.message?.includes("RESOURCE_EXHAUSTED");
          if (isRateLimit && i < maxRetries - 1) {
            const delay = Math.pow(2, i) * 2000; // 2s, 4s, 8s
            console.log(`Rate limit hit, retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          throw error;
        }
      }
    };

    try {
      // Use the environment API key (Free Tier)
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      let imageUrl = "";
      let interpretation = "";

      // Step 1: Get the intended textual response first (to ensure meaning is captured)
      const textResponse = await fetchWithRetry(() => ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: {
          parts: [
            ...(currentFile ? [{ inlineData: { data: currentFile.data, mimeType: currentFile.mimeType } }] : []),
            { text: `You are a Visual Professor. First, write a clear, concise text response to this user input: "${currentInput}". Then, I will ask you to visualize it.` }
          ]
        }
      }));
      
      interpretation = textResponse.text || "I am synthesizing a visual response for you.";

      // Step 2: Generate the image with a simplified, more reliable prompt
      const imagePrompt = `Educational whiteboard illustration showing: ${interpretation}. Bold lines, simple diagrams, high contrast.`;

      const genResponse = await fetchWithRetry(() => ai.models.generateContent({
        model: "gemini-2.5-flash-image",
        contents: {
          parts: [{ text: imagePrompt }]
        },
        config: {
          imageConfig: {
            aspectRatio: aspectRatio === "2:3" || aspectRatio === "21:9" ? "1:1" : aspectRatio as any,
          }
        }
      }));

      const candidates = genResponse.candidates;
      if (candidates && candidates.length > 0 && candidates[0].content?.parts) {
        for (const part of candidates[0].content.parts) {
          if (part.inlineData) {
            imageUrl = `data:image/png;base64,${part.inlineData.data}`;
            break;
          }
        }
      }

      if (imageUrl) {
        const aiMessage: Message = {
          id: (Date.now() + 1).toString(),
          type: "ai",
          content: "Visual Response Generated",
          imageUrl,
          interpretation,
          timestamp: new Date(),
          isMediaAnalysis: !!currentFile
        };
        setMessages((prev) => [...prev, aiMessage]);
      } else {
        const fallbackReason = candidates?.[0]?.content?.parts?.[0]?.text || "The visual synthesizer encountered an issue.";
        throw new Error(`Synthesis failed: ${fallbackReason}`);
      }
    } catch (error: any) {
      console.error("Visionary AI Error:", error);
      let userFriendlyError = error.message || "Error: Visual synthesis failed. Please try again.";
      
      if (error.message?.includes("429") || error.message?.includes("RESOURCE_EXHAUSTED")) {
        userFriendlyError = "Quota Exceeded: The AI is currently busy or has reached its free limit. Please wait a minute and try again, or use a Pro key for unlimited access.";
      }

      const errorMessage: Message = {
        id: Date.now().toString(),
        type: "ai",
        content: userFriendlyError,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGithubSync = async () => {
    if (!githubToken || !githubRepo || !githubOwner) {
      setSyncStatus({ type: 'error', message: "Please fill all GitHub fields" });
      return;
    }

    setIsSyncing(true);
    setSyncStatus(null);

    try {
      const response = await fetch("/api/github/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: githubToken,
          repo: githubRepo,
          owner: githubOwner
        })
      });

      const data = await response.json();
      if (data.success) {
        setSyncStatus({ type: 'success', message: "Project synced to GitHub!" });
      } else {
        throw new Error(data.error || "Sync failed");
      }
    } catch (error: any) {
      setSyncStatus({ type: 'error', message: error.message });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full flex flex-col font-sans overflow-hidden grid-bg">
      {/* Header */}
      <header className="h-16 border-b border-white/5 glass-panel z-20 flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-blue-500/20 border border-blue-500/30 flex items-center justify-center">
            <Cpu className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-widest uppercase text-white/90">Visionary Intelligence</h1>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] uppercase tracking-tighter text-white/40 font-mono">
                Neural Link Active
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 rounded-lg hover:bg-white/5 transition-colors text-white/60"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Settings Panel */}
      <AnimatePresence>
        {showSettings && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-16 right-6 w-72 glass-panel z-40 p-6 rounded-2xl border-white/10 shadow-3xl"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xs font-bold uppercase tracking-widest text-white/80">Synthesis Config</h3>
              <button onClick={() => setShowSettings(false)} className="text-white/40 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <label className="text-[10px] uppercase tracking-widest text-white/30 block mb-3">Aspect Ratio</label>
                <div className="grid grid-cols-4 gap-2">
                  {(["1:1", "3:4", "4:3", "9:16", "16:9"] as AspectRatio[]).map((ratio) => (
                    <button
                      key={ratio}
                      onClick={() => setAspectRatio(ratio)}
                      className={`text-[9px] py-1.5 rounded border transition-all ${
                        aspectRatio === ratio 
                          ? "bg-blue-500/20 border-blue-500/50 text-blue-400" 
                          : "border-white/5 text-white/40 hover:border-white/20"
                      }`}
                    >
                      {ratio}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[8px] text-white/20 uppercase tracking-tighter">Note: Some ratios limited in standard mode</p>
              </div>

              <div className="pt-4 border-t border-white/5">
                <label className="text-[10px] uppercase tracking-widest text-white/30 block mb-3 flex items-center gap-2">
                  <Github className="w-3 h-3" /> GitHub Manual Sync
                </label>
                <div className="space-y-2">
                  <input 
                    type="password"
                    placeholder="Personal Access Token"
                    value={githubToken}
                    onChange={(e) => setGithubToken(e.target.value)}
                    className="w-full bg-black/40 border border-white/5 rounded-lg px-3 py-2 text-[10px] text-white placeholder:text-white/20 outline-none focus:border-blue-500/50"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input 
                      type="text"
                      placeholder="Username"
                      value={githubOwner}
                      onChange={(e) => setGithubOwner(e.target.value)}
                      className="w-full bg-black/40 border border-white/5 rounded-lg px-3 py-2 text-[10px] text-white placeholder:text-white/20 outline-none focus:border-blue-500/50"
                    />
                    <input 
                      type="text"
                      placeholder="Repo Name"
                      value={githubRepo}
                      onChange={(e) => setGithubRepo(e.target.value)}
                      className="w-full bg-black/40 border border-white/5 rounded-lg px-3 py-2 text-[10px] text-white placeholder:text-white/20 outline-none focus:border-blue-500/50"
                    />
                  </div>
                  <button
                    onClick={handleGithubSync}
                    disabled={isSyncing}
                    className="w-full py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-[10px] font-bold uppercase tracking-widest text-white/60 transition-all flex items-center justify-center gap-2"
                  >
                    {isSyncing ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Zap className="w-3 h-3" />
                    )}
                    {isSyncing ? "Syncing..." : "Push to GitHub"}
                  </button>
                  {syncStatus && (
                    <div className={`flex items-center gap-2 text-[9px] mt-2 ${syncStatus.type === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
                      {syncStatus.type === 'success' ? <Check className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                      {syncStatus.message}
                    </div>
                  )}
                </div>
                <p className="mt-2 text-[8px] text-white/20 leading-tight">
                  This tool bypasses the AI Studio link button. It will upload all project files directly to your repo.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 relative flex flex-col max-w-5xl mx-auto w-full p-4 md:p-8 overflow-hidden">
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto space-y-8 pb-40 scrollbar-hide"
        >
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-6 opacity-40">
              <div className="w-20 h-20 rounded-full border-2 border-dashed border-white/10 flex items-center justify-center">
                <ImageIcon className="w-8 h-8" />
              </div>
              <div className="max-w-md">
                <h2 className="text-xl font-light mb-2">Awaiting Multimodal Input</h2>
                <p className="text-sm text-white/60">
                  Upload images, videos, or send complex problems. <br />
                  Visionary Pro synthesizes high-fidelity visual intelligence.
                </p>
              </div>
            </div>
          )}

          <AnimatePresence mode="popLayout">
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className={`flex ${msg.type === "user" ? "justify-end" : "justify-start"}`}
              >
                <div className={`max-w-[85%] md:max-w-[70%] ${msg.type === "user" ? "text-right" : "text-left"}`}>
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-white/30">
                      {msg.type === "user" ? "Human" : "Intelligence"}
                    </span>
                    <span className="text-[10px] font-mono text-white/10">
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  
                  {msg.type === "user" ? (
                    <div className="glass-panel p-4 rounded-2xl rounded-tr-none text-sm text-white/80 leading-relaxed">
                      {msg.content}
                    </div>
                  ) : (
                    <div className="group relative glass-panel p-2 rounded-2xl rounded-tl-none overflow-hidden">
                      <div className="scanline" />
                      {msg.imageUrl ? (
                        <div className="relative rounded-xl overflow-hidden bg-black/40">
                          <img 
                            src={msg.imageUrl} 
                            alt="AI Response" 
                            className="w-full h-auto cursor-zoom-in transition-transform duration-500 group-hover:scale-105"
                            onClick={() => setSelectedImage(msg.imageUrl!)}
                          />
                          <button 
                            onClick={() => setSelectedImage(msg.imageUrl!)}
                            className="absolute top-3 right-3 p-2 rounded-lg bg-black/60 backdrop-blur-md border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Maximize2 className="w-4 h-4 text-white" />
                          </button>
                        </div>
                      ) : (
                        <div className="p-4 text-sm text-red-400/80 font-mono italic">
                          {msg.content}
                        </div>
                      )}
                      <div className="mt-2 px-2 pb-1 flex items-center justify-between">
                        <span className="text-[9px] font-mono text-white/20 uppercase tracking-widest">
                          {msg.isMediaAnalysis ? "Multimodal Analysis Complete" : "Visual Synthesis Complete"}
                        </span>
                        <div className="flex gap-2">
                          {msg.interpretation && (
                            <button 
                              onClick={() => setShowInterpretation(showInterpretation === msg.id ? null : msg.id)}
                              className={`p-1 rounded transition-colors ${showInterpretation === msg.id ? "text-blue-400 bg-blue-500/10" : "text-white/20 hover:text-white/40"}`}
                              title="Neural Interpretation"
                            >
                              <Zap className="w-3 h-3" />
                            </button>
                          )}
                          <div className={`w-1 h-1 rounded-full ${msg.imageUrl ? "bg-blue-500/40" : "bg-red-500/40"}`} />
                          <div className={`w-1 h-1 rounded-full ${msg.imageUrl ? "bg-blue-500/40" : "bg-red-500/40"}`} />
                          <div className={`w-1 h-1 rounded-full ${msg.imageUrl ? "bg-blue-500/40" : "bg-red-500/40"}`} />
                        </div>
                      </div>
                      
                      <AnimatePresence>
                        {showInterpretation === msg.id && msg.interpretation && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="px-3 pb-3 pt-1 border-t border-white/5"
                          >
                            <div className="text-[11px] text-white/60 leading-relaxed font-mono bg-black/20 p-2 rounded-lg">
                              <span className="text-blue-400/60 mr-1">LOG:</span>
                              {msg.interpretation}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {isLoading && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex justify-start"
            >
              <div className="w-full max-w-[85%] md:max-w-[70%]">
                <div className="flex items-center gap-2 mb-2 px-1">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-white/30">Intelligence</span>
                  <span className="text-[10px] font-mono text-white/10 animate-pulse">Processing...</span>
                </div>
                <div className="glass-panel p-2 rounded-2xl rounded-tl-none overflow-hidden relative">
                  <div className="aspect-square rounded-xl bg-black/40 relative overflow-hidden mosaic-bg">
                    <div className="absolute inset-0 flex flex-col items-center justify-center space-y-4">
                      <div className="relative w-48 h-1 bg-white/5 rounded-full overflow-hidden border border-white/5">
                        <motion.div 
                          className="absolute inset-0 bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.8)]"
                          initial={{ width: "0%" }}
                          animate={{ width: `${loadingProgress}%` }}
                          transition={{ ease: "easeOut" }}
                        />
                        <div className="scanline opacity-50" />
                      </div>
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-[10px] font-mono text-blue-400/60 uppercase tracking-[0.2em] animate-pulse-fast">
                          Synthesizing Pixels
                        </span>
                        <span className="text-[9px] font-mono text-white/20 uppercase">
                          {Math.round(loadingProgress)}% Complete
                        </span>
                      </div>
                    </div>
                    {/* Mosaic Blocks Effect */}
                    <div className="absolute inset-0 grid grid-cols-8 grid-rows-8 opacity-20 pointer-events-none">
                      {Array.from({ length: 64 }).map((_, i) => (
                        <motion.div 
                          key={i}
                          className="bg-blue-500/10 border-[0.5px] border-white/5"
                          animate={{ 
                            opacity: [0.1, 0.3, 0.1],
                          }}
                          transition={{ 
                            duration: 2, 
                            repeat: Infinity, 
                            delay: Math.random() * 2 
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </main>

      {/* Input Area */}
      <div className="absolute bottom-0 left-0 w-full p-4 md:p-8 z-30">
        <div className="max-w-3xl mx-auto relative">
          {attachedFile && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute -top-16 left-0 flex items-center gap-3 glass-panel px-4 py-2 rounded-xl border-blue-500/30"
            >
              {attachedFile.mimeType.startsWith('video') ? <FileVideo className="w-4 h-4 text-blue-400" /> : <ImageIcon className="w-4 h-4 text-blue-400" />}
              <span className="text-[10px] font-mono text-white/60 truncate max-w-[150px]">{attachedFile.name}</span>
              <button onClick={() => setAttachedFile(null)} className="text-white/20 hover:text-white">
                <X className="w-3 h-3" />
              </button>
            </motion.div>
          )}
          
          <div className="absolute -top-6 left-4 flex items-center gap-2 text-[10px] font-mono text-white/20 uppercase tracking-widest">
            <Terminal className="w-3 h-3" />
            <span>Command Input</span>
          </div>
          
          <div className="glass-panel p-2 rounded-2xl flex items-center gap-2 shadow-2xl border-white/10">
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="p-3 rounded-xl hover:bg-white/5 transition-colors text-white/40"
            >
              <Upload className="w-5 h-5" />
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              className="hidden" 
              accept="image/*,video/*"
            />
            
            <div className="h-6 w-px bg-white/5 mx-1" />
            
            <input 
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder={attachedFile ? "Ask about this file..." : "Enter problem or visual request..."}
              className="flex-1 bg-transparent border-none outline-none text-sm py-3 text-white placeholder:text-white/20"
            />
            
            <button 
              onClick={handleSend}
              disabled={isLoading || (!input.trim() && !attachedFile)}
              className={`p-3 rounded-xl transition-all ${
                isLoading || (!input.trim() && !attachedFile)
                  ? "bg-white/5 text-white/10" 
                  : "bg-blue-600 text-white hover:bg-blue-500 shadow-[0_0_20px_rgba(37,99,235,0.4)]"
              }`}
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Image Modal */}
      <AnimatePresence>
        {selectedImage && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedImage(null)}
            className="fixed inset-0 z-50 bg-black/95 backdrop-blur-xl flex items-center justify-center p-4 md:p-12"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative max-w-full max-h-full"
            >
              <img 
                src={selectedImage} 
                alt="Enlarged synthesis" 
                className="max-w-full max-h-[90vh] rounded-2xl shadow-2xl border border-white/10"
              />
              <div className="absolute -bottom-12 left-0 w-full flex justify-between items-center text-[10px] font-mono text-white/40 uppercase tracking-widest">
                <span>Visual Intelligence Output</span>
                <span>Press anywhere to close</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}



