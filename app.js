// --- Application State Management ---
const STATE_IDLE = 'idle';
const STATE_WALKING = 'walking';
const STATE_THROWING = 'throwing';
const STATE_CELEBRATING = 'celebrating';

let currentState = STATE_IDLE;
let animationFrameId = null;
let startTime = null;

// Element References
let characterContainer, leftLeg, rightLeg, leftArm, rightArm;
let characterGlasses, flyingGlasses, milestone22;
let balloonsContainer;

// Physics / Positions
let charX = -180; // starts off screen
let destX = 0;    // calculated at runtime based on screen size
const walkSpeed = 2.4; // pixels per frame

// Throw glasses physics
let throwStartLeft = 0;
let throwStartTop = 0;
let throwEndLeft = 0;
let throwEndTop = 0;
let throwProgress = 0;

// --- Audio Synthesizer (Web Audio API) ---
let audioCtx = null;
let masterGain = null;
let audioPlaying = false;
let songTimeoutId = null;

const melodyNotes = [
    { f: 392.00, d: 0.75 }, { f: 392.00, d: 0.25 }, { f: 440.00, d: 1 }, { f: 392.00, d: 1 }, { f: 523.25, d: 1 }, { f: 493.88, d: 2 }, // Phrase 1
    { f: 392.00, d: 0.75 }, { f: 392.00, d: 0.25 }, { f: 440.00, d: 1 }, { f: 392.00, d: 1 }, { f: 587.33, d: 1 }, { f: 523.25, d: 2 }, // Phrase 2
    { f: 392.00, d: 0.75 }, { f: 392.00, d: 0.25 }, { f: 783.99, d: 1 }, { f: 659.25, d: 1 }, { f: 523.25, d: 1 }, { f: 493.88, d: 1 }, { f: 440.00, d: 2 }, // Phrase 3
    { f: 698.46, d: 0.75 }, { f: 698.46, d: 0.25 }, { f: 659.25, d: 1 }, { f: 523.25, d: 1 }, { f: 587.33, d: 1 }, { f: 523.25, d: 2 }  // Phrase 4
];
const tempo = 140; 
const beatDuration = 60 / tempo;

function initAudio() {
    if (audioCtx) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContextClass();
    
    masterGain = audioCtx.createGain();
    masterGain.gain.setValueAtTime(0.15, audioCtx.currentTime); // comfortable volume
    masterGain.connect(audioCtx.destination);
}

function playMelody(scheduledTime) {
    if (!audioPlaying) return;
    
    let currentScheduledTime = scheduledTime;
    
    melodyNotes.forEach(note => {
        const osc = audioCtx.createOscillator();
        const noteGain = audioCtx.createGain();
        
        osc.type = 'triangle'; // chiptune tone
        osc.frequency.setValueAtTime(note.f, currentScheduledTime);
        
        noteGain.gain.setValueAtTime(0, currentScheduledTime);
        noteGain.gain.linearRampToValueAtTime(0.18, currentScheduledTime + 0.02);
        noteGain.gain.setValueAtTime(0.18, currentScheduledTime + note.d * beatDuration - 0.04);
        noteGain.gain.linearRampToValueAtTime(0, currentScheduledTime + note.d * beatDuration);
        
        osc.connect(noteGain);
        noteGain.connect(masterGain);
        
        osc.start(currentScheduledTime);
        osc.stop(currentScheduledTime + note.d * beatDuration);
        
        currentScheduledTime += note.d * beatDuration;
    });
    
    const loopDuration = melodyNotes.reduce((sum, n) => sum + n.d * beatDuration, 0);
    songTimeoutId = setTimeout(() => {
        playMelody(currentScheduledTime);
    }, loopDuration * 1000 - 50);
}

function startMusic() {
    initAudio();
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    audioPlaying = true;
    document.getElementById('music-toggle').classList.remove('hidden');
    playMelody(audioCtx.currentTime + 0.1);
}

function stopMusic() {
    audioPlaying = false;
    if (songTimeoutId) {
        clearTimeout(songTimeoutId);
        songTimeoutId = null;
    }
}

// --- 2D Balloon Spawning System ---
const balloonColors = ['#ff007f', '#00f0ff', '#ffea00', '#39ff14', '#ff5e00', '#e100ff', '#ff8b94'];
const activeBalloons = [];
let balloonIntervalId = null;

function spawnBalloon() {
    const balloon = document.createElement('div');
    balloon.className = 'balloon-2d';
    
    const color = balloonColors[Math.floor(Math.random() * balloonColors.length)];
    balloon.style.color = color;
    balloon.style.backgroundColor = color;
    
    const string = document.createElement('div');
    string.className = 'balloon-string-2d';
    balloon.appendChild(string);
    
    const startX = Math.random() * window.innerWidth;
    const speed = Math.random() * 1.5 + 2.0; 
    const swingAmp = Math.random() * 30 + 15;
    const swingFreq = Math.random() * 0.03 + 0.015;
    
    balloon.style.left = startX + 'px';
    balloon.style.top = window.innerHeight + 100 + 'px';
    
    balloonsContainer.appendChild(balloon);
    activeBalloons.push({
        element: balloon,
        x: startX,
        y: window.innerHeight + 100,
        speed: speed,
        swingAmp: swingAmp,
        swingFreq: swingFreq,
        phase: Math.random() * Math.PI * 2
    });
}

function updateBalloons(time) {
    for (let i = activeBalloons.length - 1; i >= 0; i--) {
        const b = activeBalloons[i];
        b.y -= b.speed;
        const currentX = b.x + Math.sin(time * b.swingFreq * 4 + b.phase) * b.swingAmp;
        
        b.element.style.left = currentX + 'px';
        b.element.style.top = b.y + 'px';
        
        // Remove if balloon drifts off top screen
        if (b.y < -120) {
            b.element.remove();
            activeBalloons.splice(i, 1);
        }
    }
}

// --- Main Animation loop ---
function updateAnimation() {
    animationFrameId = requestAnimationFrame(updateAnimation);
    
    const time = (Date.now() - startTime) / 1000;
    
    // 1. STATE: WALKING
    if (currentState === STATE_WALKING) {
        if (charX < destX) {
            charX += walkSpeed;
            characterContainer.style.left = charX + 'px';
            
            // Swing legs back and forth
            const legAngle = Math.sin(time * 10.5) * 28; // 28 degrees swing
            leftLeg.style.transform = `rotate(${legAngle}deg)`;
            rightLeg.style.transform = `rotate(${-legAngle}deg)`;
            
            // Swing arms in opposition
            leftArm.style.transform = `rotate(${-legAngle * 0.6}deg)`;
            rightArm.style.transform = `rotate(${legAngle * 0.6}deg)`;
            
            // Subtle head bob inside container
            characterContainer.style.transform = `translateY(${Math.abs(Math.sin(time * 21)) * 3}px)`;
        } else {
            // Reached milestone! Reset poses, prepare throw
            leftLeg.style.transform = '';
            rightLeg.style.transform = '';
            leftArm.style.transform = '';
            rightArm.style.transform = '';
            characterContainer.style.transform = '';
            
            currentState = STATE_THROWING;
            throwProgress = 0;
            
            // Calculate coordinates for the flying glasses throw
            throwStartLeft = charX + 78; // eyes position relative to SVG width
            throwStartTop = window.innerHeight - 130 - 250 + 74; // bottom-line, container height, eyes Y offset
            throwEndLeft = throwStartLeft + 140; // lands to the right
            throwEndTop = window.innerHeight - 130 - 15; // lands on the floor
        }
    }
    
    // 2. STATE: THROWING
    if (currentState === STATE_THROWING) {
        throwProgress += 0.024; // speed of throw
        
        // Arm preparation motion
        if (throwProgress < 0.25) {
            // Swing arm back
            rightArm.style.transform = 'rotate(-85deg)';
        } else if (throwProgress < 0.5) {
            // Swing arm forward rapidly
            rightArm.style.transform = 'rotate(45deg)';
            
            // Trigger glasses release
            characterGlasses.style.display = 'none';
            flyingGlasses.classList.remove('hidden');
        } else {
            // return arm to normal
            rightArm.style.transform = 'rotate(0deg)';
        }
        
        // Animate flying glasses trajectory (after release)
        if (throwProgress >= 0.35 && throwProgress <= 1.0) {
            // Map progress of glasses flight from 0 to 1
            const t = (throwProgress - 0.35) / 0.65; 
            
            const currentLeft = throwStartLeft + (throwEndLeft - throwStartLeft) * t;
            // Parabolic Y arc
            const currentTop = throwStartTop * (1 - t) + throwEndTop * t - Math.sin(t * Math.PI) * 110;
            const spin = t * 720; // spin twice
            
            flyingGlasses.style.left = currentLeft + 'px';
            flyingGlasses.style.top = currentTop + 'px';
            flyingGlasses.style.transform = `rotate(${spin}deg)`;
        } else if (throwProgress > 1.0) {
            // Landed on floor
            flyingGlasses.style.left = throwEndLeft + 'px';
            flyingGlasses.style.top = throwEndTop + 'px';
            flyingGlasses.style.transform = 'rotate(15deg)'; // lay flat
            
            // Launch celebration!
            triggerCelebration();
        }
    }
    
    // 3. STATE: CELEBRATING
    if (currentState === STATE_CELEBRATING) {
        // Character jumps happily
        const jumpY = Math.max(0, Math.sin(time * 14) * 22);
        characterContainer.style.transform = `translateY(${-jumpY}px)`;
        
        // Arms wave excitedly in the air
        const waveAngle = Math.sin(time * 16) * 18;
        leftArm.style.transform = `rotate(${145 + waveAngle}deg)`;
        rightArm.style.transform = `rotate(${-145 - waveAngle}deg)`;
        
        // Update 2D balloons
        updateBalloons(time);
    }
}

// --- Initialize Celebration effects ---
function triggerCelebration() {
    currentState = STATE_CELEBRATING;
    
    // 1. Reveal Final Birthday Message
    const celebrationUI = document.getElementById('celebration-screen');
    celebrationUI.classList.remove('hidden');
    
    // 2. Continuous 2D Balloon Spawning
    if (!balloonIntervalId) {
        balloonIntervalId = setInterval(spawnBalloon, 750);
        // Spawn initial batch
        for(let i = 0; i < 6; i++) {
            setTimeout(spawnBalloon, i * 200);
        }
    }
    
    // 3. Canvas Confetti explosions
    confetti({
        particleCount: 100,
        spread: 70,
        origin: { x: 0.1, y: 0.7 }
    });
    confetti({
        particleCount: 100,
        spread: 70,
        origin: { x: 0.9, y: 0.7 }
    });
    
    // Continuous random side bursts
    const end = Date.now() + (12 * 1000); // 12 seconds of confetti
    (function frame() {
        if (currentState !== STATE_CELEBRATING) return;
        
        confetti({
            particleCount: 3,
            angle: 60,
            spread: 55,
            origin: { x: 0, y: 0.8 }
        });
        confetti({
            particleCount: 3,
            angle: 120,
            spread: 55,
            origin: { x: 1, y: 0.8 }
        });

        if (Date.now() < end) {
            requestAnimationFrame(frame);
        }
    }());
}

// --- Start the surprise walk sequence ---
function startSequence() {
    currentState = STATE_WALKING;
    startTime = Date.now();
    
    // Animate welcome screen out
    document.getElementById('welcome-screen').classList.add('hidden');
    
    // Calculate character destination (in front of the "22" milestone)
    const milestoneRect = milestone22.getBoundingClientRect();
    destX = milestoneRect.left - 130; // Stop just to the left of the milestone
    
    // Fallback if milestone hasn't rendered yet or window is tiny
    if (destX < 50) {
        destX = window.innerWidth * 0.45;
    }
    
    // Start Audio
    startMusic();
    
    // Kick off animation loop
    if (!animationFrameId) {
        updateAnimation();
    }
}

// --- App Setup & Event Wiring ---
window.onload = () => {
    // Select elements
    characterContainer = document.getElementById('character-container');
    leftLeg = document.getElementById('left-leg');
    rightLeg = document.getElementById('right-leg');
    leftArm = document.getElementById('left-arm');
    rightArm = document.getElementById('right-arm');
    characterGlasses = document.getElementById('character-glasses');
    flyingGlasses = document.getElementById('flying-glasses');
    milestone22 = document.getElementById('milestone-22');
    balloonsContainer = document.getElementById('balloons-container');
    
    // Set initial position of character
    characterContainer.style.left = charX + 'px';
    
    // Start button click
    const startBtn = document.getElementById('start-btn');
    startBtn.onclick = () => {
        startSequence();
    };
    
    // Music mute button click
    const toggleBtn = document.getElementById('music-toggle');
    toggleBtn.onclick = () => {
        const iconSpan = toggleBtn.querySelector('.icon');
        if (audioPlaying) {
            stopMusic();
            iconSpan.textContent = '🔇';
        } else {
            startMusic();
            iconSpan.textContent = '🔊';
        }
    };
    
    // Handle window resize dynamically to adjust walking target
    window.onresize = () => {
        if (currentState === STATE_WALKING || currentState === STATE_IDLE) {
            const milestoneRect = milestone22.getBoundingClientRect();
            destX = milestoneRect.left - 130;
            if (destX < 50) {
                destX = window.innerWidth * 0.45;
            }
        }
    };
};
