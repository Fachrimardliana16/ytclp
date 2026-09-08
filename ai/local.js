'use strict';

/**
 * OpenCode Local AI Module
 * Menggunakan model lokal untuk AI features
 */

class LocalAI {
    constructor() {
        this.models = {
            titleGenerator: null,
            highlightScorer: null
        };
        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) return true;
        
        try {
            // Load model lokal (contoh: menggunakan simple ML patterns)
            console.log('[AI] Initializing local models...');
            
            // Untuk sekarang, kita gunakan rule-based + statistical approach
            // Nanti bisa diganti dengan model ONNX atau TensorFlow.js
            this.models.highlightScorer = this.createHighlightScorer();
            this.models.titleGenerator = this.createTitleGenerator();
            
            this.initialized = true;
            console.log('[AI] Local models ready');
            return true;
        } catch (error) {
            console.error('[AI] Failed to initialize:', error);
            return false;
        }
    }

    createHighlightScorer() {
        // Rule-based scoring dengan weights
        return {
            scoreSegment: (text, position, totalDuration) => {
                let score = 0;
                const lowerText = text.toLowerCase();
                
                // Hook words scoring (dari keyword analysis)
                const hookWords = {
                    high: ['wow', 'amazing', 'incredible', 'keren', 'gila', 'luar biasa', 'terbaik', 'rahasia'],
                    medium: ['important', 'listen', 'perhatikan', 'dengar', 'lihat', 'check', 'watch'],
                    low: ['why', 'how', 'what', 'kenapa', 'gimana', 'apa']
                };
                
                // Check hook words
                hookWords.high.forEach(word => {
                    if (lowerText.includes(word)) score += 10;
                });
                hookWords.medium.forEach(word => {
                    if (lowerText.includes(word)) score += 5;
                });
                hookWords.low.forEach(word => {
                    if (lowerText.includes(word)) score += 2;
                });
                
                // Question marks and exclamation
                const questionMarks = (text.match(/\?/g) || []).length;
                const exclamationMarks = (text.match(/!/g) || []).length;
                score += questionMarks * 3 + exclamationMarks * 4;
                
                // Word density (kata per detik)
                const words = text.split(/\s+/).length;
                const density = words / 10; // Normalized
                score += Math.min(density * 2, 10);
                
                // Position scoring (awal dan akhir lebih menarik)
                const positionRatio = position / totalDuration;
                if (positionRatio < 0.1 || positionRatio > 0.9) {
                    score *= 0.7; // Penalty for very start/end
                } else if (positionRatio > 0.3 && positionRatio < 0.7) {
                    score *= 1.2; // Bonus for middle content
                }
                
                // Text length bonus
                if (text.length > 50 && text.length < 200) {
                    score *= 1.1;
                }
                
                return Math.round(score);
            }
        };
    }

    createTitleGenerator() {
        // Template-based title generation
        const templates = [
            "Momen {hook} yang Bikin {emotion}!",
            "Ternyata {topic} Itu {adjective}!",
            "Jangan Sampai Ketinggalan: {topic}",
            "{topic} yang Wajib Kamu Tahu",
            "Rahasia {topic} Terungkap!",
            "Bagaimana {topic} Bisa {result}?",
            "Kisah {topic} yang Menginspirasi",
            "{topic}: Panduan Lengkap untuk Pemula",
            "Review {topic}: Worth It atau Enggak?",
            "Challenge {topic}: Hasilnya Unexpected!"
        ];
        
        const hooks = ['Menarik', 'Seru', 'Mengejutkan', 'Inspiratif', 'Menghibur'];
        const emotions = ['Kaget', 'Tertawa', 'Terenyuh', 'Semangat', 'Penasaran'];
        const adjectives = ['Luar Biasa', 'Mengejutkan', 'Sederhana', 'Kompleks', 'Unik'];
        
        return {
            generate: (text, context = {}) => {
                // Ekstrak topik dari text
                const words = text.split(/\s+/).filter(w => w.length > 3);
                const topicWords = words.slice(0, 5).join(' ');
                
                // Pilih template random
                const template = templates[Math.floor(Math.random() * templates.length)];
                
                // Generate title
                let title = template
                    .replace('{hook}', hooks[Math.floor(Math.random() * hooks.length)])
                    .replace('{emotion}', emotions[Math.floor(Math.random() * emotions.length)])
                    .replace('{topic}', topicWords || 'Topik Ini')
                    .replace('{adjective}', adjectives[Math.floor(Math.random() * adjectives.length)])
                    .replace('{result}', 'Berhasil');
                
                // Batasi panjang title
                if (title.length > 60) {
                    title = title.substring(0, 57) + '...';
                }
                
                return title;
            }
        };
    }

    async analyzeHighlights(segments, options = {}) {
        if (!this.initialized) await this.initialize();
        
        const { clipLength = 30, numClips = 5 } = options;
        const totalDuration = segments.length > 0 
            ? (segments[segments.length - 1].offset + segments[segments.length - 1].duration) / 1000 
            : 0;
        
        // Score setiap segment
        const scoredSegments = segments.map((seg, idx) => {
            const score = this.models.highlightScorer.scoreSegment(
                seg.text,
                seg.offset / 1000,
                totalDuration
            );
            
            return {
                ...seg,
                score,
                index: idx
            };
        });
        
        // Sorting berdasarkan score
        scoredSegments.sort((a, b) => b.score - a.score);
        
        // Pilih top N clips tanpa overlap
        const selectedClips = [];
        const minGap = clipLength * 0.5; // Minimal gap antar clips
        
        for (const seg of scoredSegments) {
            if (selectedClips.length >= numClips) break;
            
            const startTime = Math.max(0, (seg.offset / 1000) - 2);
            const endTime = Math.min(totalDuration, startTime + clipLength);
            
            // Cek overlap dengan clips yang sudah dipilih
            const overlaps = selectedClips.some(clip => {
                return Math.abs(startTime - clip.startTime) < minGap;
            });
            
            if (!overlaps) {
                selectedClips.push({
                    startTime: Math.round(startTime),
                    endTime: Math.round(endTime),
                    score: seg.score,
                    title: this.models.titleGenerator.generate(seg.text),
                    summary: seg.text.substring(0, 120) + (seg.text.length > 120 ? '...' : ''),
                    duration: Math.round(endTime - startTime)
                });
            }
        }
        
        // Urutkan berdasarkan waktu
        selectedClips.sort((a, b) => a.startTime - b.startTime);
        
        return selectedClips;
    }

    async generateTitle(text, style = 'catchy') {
        if (!this.initialized) await this.initialize();
        return this.models.titleGenerator.generate(text);
    }

    async getCaptionStyles() {
        // Return caption templates yang tersedia
        return [
            { id: 'minimal', name: 'Minimalis', font: 'Arial', color: '#FFFFFF', animation: 'none' },
            { id: 'bold', name: 'Bold', font: 'Impact', color: '#FFD700', animation: 'bounce' },
            { id: 'neon', name: 'Neon', font: 'Montserrat', color: '#00FFFF', animation: 'glow' },
            { id: 'retro', name: 'Retro', font: 'Courier New', color: '#FF6B6B', animation: 'typewriter' },
            { id: 'modern', name: 'Modern', font: 'Poppins', color: '#FFFFFF', animation: 'fade' },
            { id: 'comic', name: 'Comic', font: 'Comic Sans MS', color: '#FF4500', animation: 'pop' },
            { id: 'elegant', name: 'Elegant', font: 'Georgia', color: '#DAA520', animation: 'slide' },
            { id: 'gaming', name: 'Gaming', font: 'Press Start 2P', color: '#00FF00', animation: 'glitch' },
            { id: 'vlog', name: 'Vlog', font: 'Quicksand', color: '#FF69B4', animation: 'wave' },
            { id: 'professional', name: 'Professional', font: 'Helvetica', color: '#333333', animation: 'fade' }
        ];
    }

    async smartCrop(imagePath) {
        // Placeholder untuk smart crop - nanti bisa pakai face detection
        // Untuk sekarang return center crop
        return {
            x: 0.1, // 10% from left
            y: 0.1, // 10% from top
            width: 0.8, // 80% width
            height: 0.8, // 80% height
            confidence: 0.7
        };
    }
}

// Singleton instance
const localAI = new LocalAI();

module.exports = {
    initialize: () => localAI.initialize(),
    analyzeHighlights: (segments, options) => localAI.analyzeHighlights(segments, options),
    generateTitle: (text, style) => localAI.generateTitle(text, style),
    getCaptionStyles: () => localAI.getCaptionStyles(),
    smartCrop: (imagePath) => localAI.smartCrop(imagePath)
};