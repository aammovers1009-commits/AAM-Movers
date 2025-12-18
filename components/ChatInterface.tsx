
import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage } from '../types';

interface ChatInterfaceProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  isLoading: boolean;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ messages, onSendMessage, isLoading }) => {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    onSendMessage(input);
    setInput('');
  };

  return (
    <div className="flex flex-col h-[600px] bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-sm">
      <div className="bg-stone-900 text-white p-4 flex items-center space-x-3">
        <div className="w-10 h-10 bg-stone-700 rounded-full flex items-center justify-center">
          <svg className="w-6 h-6 text-stone-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        </div>
        <div>
          <h3 className="font-semibold">LuxeRoom AI Assistant</h3>
          <p className="text-xs text-stone-400">Expert Interior Design Advice</p>
        </div>
      </div>

      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 bg-stone-50"
      >
        {messages.map((msg, i) => (
          <div 
            key={i} 
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div 
              className={`max-w-[85%] rounded-2xl p-4 shadow-sm ${
                msg.role === 'user' 
                  ? 'bg-stone-900 text-white rounded-tr-none' 
                  : 'bg-white text-stone-800 border border-stone-200 rounded-tl-none'
              }`}
            >
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
              
              {msg.links && msg.links.length > 0 && (
                <div className="mt-4 pt-3 border-t border-stone-100 space-y-2">
                  <p className="text-[10px] font-bold uppercase text-stone-400 tracking-wider">Suggested Products</p>
                  {msg.links.map((link, idx) => (
                    <a 
                      key={idx}
                      href={link.uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-xs text-blue-500 hover:text-blue-600 underline font-medium"
                    >
                      • {link.title}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white border border-stone-200 rounded-2xl rounded-tl-none p-4 shadow-sm">
              <div className="flex space-x-2">
                <div className="w-2 h-2 bg-stone-300 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-stone-300 rounded-full animate-bounce [animation-delay:-.15s]"></div>
                <div className="w-2 h-2 bg-stone-300 rounded-full animate-bounce [animation-delay:-.3s]"></div>
              </div>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="p-4 bg-white border-t border-stone-200">
        <div className="relative">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask for changes or product links..."
            className="w-full pl-4 pr-12 py-3 bg-stone-100 border-none rounded-xl focus:ring-2 focus:ring-stone-400 text-sm transition-all"
            disabled={isLoading}
          />
          <button 
            type="submit"
            disabled={isLoading || !input.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-stone-900 text-white rounded-lg hover:bg-stone-800 disabled:opacity-50 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
        <p className="text-[10px] text-stone-400 mt-2 text-center">Try: "Make the rug blue" or "Find me some Mid-Century chairs"</p>
      </form>
    </div>
  );
};

export default ChatInterface;
