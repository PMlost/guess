// flag-game.js

class FlagGame {
  constructor() {
    this.countries = [];
    this.currentDifficulty = "easy";
    this.currentQuestion = 0;
    this.score = 0;
    this.lives = 3;
    this.maxLives = 3;
    this.usedAdRevive = false;
    this.currentQuestions = [];
    this.questionCount = 10;
    //timer
    this.timer = null;
    this.remainingTime = 5;
    this.lastTick = null;

    this.difficultySettings = {
      easy: { lives: 3, questionsPerLevel: 10 },
      medium: { lives: 2, questionsPerLevel: 15 },
      hard: { lives: 1, questionsPerLevel: 20 },
    };

    this.unlockedLevels = JSON.parse(
      localStorage.getItem("unlockedLevels") || '["easy"]'
    );
    this.totalAdsUsed = parseInt(localStorage.getItem("totalAdsUsed") || "0");
    this.highScores = JSON.parse(
      localStorage.getItem("flagGameHighScores") ||
        '{"easy": 0, "medium": 0, "hard": 0}'
    );

    this.init();
    // --- Pi Authentication ---
    this.authenticatePi();
  }

  async init() {
    await this.loadCountries();
    // Check if user closed app after exhausting all options
    const wasGameOver = localStorage.getItem("gameOverState");
    if (wasGameOver === "true") {
      this.resetAllProgress();
      localStorage.removeItem("gameOverState");
    }
    this.updateUI();
    this.updateDifficultyButtons();
    await this.generateQuestions();
    this.displayQuestion();
  }

  // Authenticate Pi user and save username/token
  async authenticatePi() {
    const scopes = ["username", "payments"];
    try {
      const auth = await Pi.authenticate(scopes, (payment) => {
        console.log("Incomplete payment found:", payment);
      });
      this.piUser = auth.user;
      this.piAccessToken = auth.accessToken;
      console.log("Authenticated Pi User:", this.piUser.username);
      document.getElementById("username").textContent = this.piUser.username;

      // Show animated greeting
      const greetingEl = document.getElementById("userGreeting");
      greetingEl.classList.add("show");
    } catch (err) {
      console.error("Pi Auth failed:", err);
    }
  }

  async loadCountries() {
    try {
      console.log("Loading countries from API...");
      const response = await fetch("/api/countries");

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.success && data.data) {
        this.countries = data.data;
        console.log(`Loaded ${this.countries.length} countries from server`);
      } else {
        throw new Error(data.error || "API returned unsuccessful response");
      }
    } catch (error) {
      console.error("Error loading countries:", error);
      throw error; // Re-throw to handle in init
    }
  }

  updateDifficultyButtons() {
    const buttons = ["easyBtn", "mediumBtn", "hardBtn"];
    const levels = ["easy", "medium", "hard"];

    buttons.forEach((btnId, index) => {
      const btn = document.getElementById(btnId);
      const level = levels[index];

      if (this.unlockedLevels.includes(level)) {
        btn.classList.remove("locked");
      } else {
        btn.classList.add("locked");
      }

      if (level === this.currentDifficulty) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });
  }

  selectDifficulty(difficulty) {
    if (!this.unlockedLevels.includes(difficulty)) return;

    this.currentDifficulty = difficulty;
    this.resetGame();
    this.updateDifficultyButtons();
  }

  async resetGame() {
    const settings = this.difficultySettings[this.currentDifficulty];
    this.lives = settings.lives;
    this.maxLives = settings.lives;
    this.score = 0;
    this.currentQuestion = 0;
    this.usedAdRevive = false;
    this.questionCount = settings.questionsPerLevel;

    await this.generateQuestions();
    this.updateUI();
    this.displayQuestion();
  }

  async generateQuestions() {
    const difficulty = this.currentDifficulty || "easy";
    const questionCount = this.questionCount || 10;

    console.log(
      `Generating questions for: ${difficulty} with count: ${questionCount}`
    );

    try {
      const url = `/api/questions/${difficulty}/${questionCount}`;
      console.log("Fetching URL:", url);

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log("API Response:", data);

      if (data.success && data.data) {
        this.currentQuestions = data.data.map((q) => ({
          country: q.country,
          options: q.options,
        }));
        console.log(
          `Generated ${this.currentQuestions.length} questions from API`
        );
      } else {
        throw new Error(data.error || "API returned unsuccessful response");
      }
    } catch (error) {
      console.error("Error generating questions from API:", error);
      throw error;
    }
  }

  displayQuestion() {
    if (this.currentQuestion >= this.currentQuestions.length) {
      this.completeLevel();
      return;
    }

    const question = this.currentQuestions[this.currentQuestion];
    document.getElementById("flagImg").src = question.country.flag;
    document.getElementById("questionNum").textContent =
      this.currentQuestion + 1;
    document.getElementById("totalQuestions").textContent = this.questionCount;

    // Update progress bar
    const progress = (this.currentQuestion / this.questionCount) * 100;
    document.getElementById("progressBar").style.width = progress + "%";

    // Create option buttons
    const container = document.getElementById("optionsContainer");
    container.innerHTML = "";

    //timer
    this.startTimer();

    question.options.forEach((option, index) => {
      const btn = document.createElement("button");
      btn.className = "option-btn";
      btn.textContent = option.name;
      btn.onclick = () => this.selectOption(option, btn);
      container.appendChild(btn);
    });

    document.getElementById("nextBtn").classList.remove("show");
  }

  //timer
  startTimer() {
    this.clearTimer();
    this.remainingTime = 5;
    this.lastTick = Date.now();
    this.updateTimerUI();

    this.timer = setInterval(() => {
      const now = Date.now();
      const delta = Math.floor((now - this.lastTick) / 1000);
      if (delta >= 1) {
        this.remainingTime -= delta;
        this.lastTick = now;
        this.updateTimerUI();

        if (this.remainingTime <= 0) {
          this.clearTimer();
          // Auto-wrong answer
          this.loseLife();
          this.updateUI();
          // If player still has lives, reload the SAME question instead of skipping
          if (this.lives > 0) {
            setTimeout(() => {
              this.displayQuestion();
            }, 1000);
          }
        }
      }
    }, 300);
  }

  clearTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  updateTimerUI() {
    const timerEl = document.getElementById("timerCircle");
    const valueEl = document.getElementById("timerValue");
    const pathEl = document.getElementById("timerPath");

    // Update text
    valueEl.textContent = this.remainingTime;

    // Update stroke dasharray (percentage of circle left)
    const percent = (this.remainingTime / 5) * 100;
    pathEl.setAttribute("stroke-dasharray", `${percent}, 100`);

    // Reset classes
    timerEl.classList.remove("timer-warning", "timer-danger");

    if (this.remainingTime <= 2) {
      pathEl.style.stroke = "#f44336"; // red
      timerEl.classList.add("timer-danger");
    } else if (this.remainingTime <= 4) {
      pathEl.style.stroke = "#ff9800"; // orange
      timerEl.classList.add("timer-warning");
    } else {
      pathEl.style.stroke = "#4caf50"; // green
    }
  }

  //helper
  pauseTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      // Save how much time was left
      this.pausedRemainingTime = this.remainingTime;
    }
  }

  resumeTimer() {
    if (this.pausedRemainingTime && this.pausedRemainingTime > 0) {
      this.remainingTime = this.pausedRemainingTime;
    }
    this.startTimer();
  }

  selectOption(selectedOption, buttonElement) {
    this.clearTimer();

    const question = this.currentQuestions[this.currentQuestion];
    const isCorrect = selectedOption.id === question.country.id;

    // Disable all buttons immediately
    document.querySelectorAll(".option-btn").forEach((btn) => {
      btn.classList.add("disabled");
      btn.style.pointerEvents = "none";
      btn.onclick = null;
    });

    if (isCorrect) {
      buttonElement.classList.add("correct");
      this.score += this.getDifficultyMultiplier();
      this.showCorrectPopup();

      // Always show next button for correct answers after popup
      setTimeout(() => {
        document.getElementById("nextBtn").classList.add("show");
      }, 1000);
    } else {
      buttonElement.classList.add("wrong");
      this.showWrongPopup();
      this.loseLife();

      // Restart timer after wrong attempt
      this.clearTimer();
      this.startTimer();

      if (this.lives <= 0) {
        // Game over - don't allow retries
        return;
      } else {
        // Allow retry on same question after popup
        setTimeout(() => {
          this.resetCurrentQuestion();
        }, 2500);
      }
    }

    this.updateUI();
  }

  getDifficultyMultiplier() {
    switch (this.currentDifficulty) {
      case "easy":
        return 10;
      case "medium":
        return 20;
      case "hard":
        return 50;
      default:
        return 10;
    }
  }

  showCorrectPopup() {
    const popup = document.getElementById("correctPopup");
    popup.classList.add("show");
    setTimeout(() => {
      popup.classList.remove("show");
    }, 1500);
  }
  showWrongPopup() {
    const popup = document.getElementById("wrongPopup");
    popup.classList.add("show");
    setTimeout(() => {
      popup.classList.remove("show");
    }, 2000);
  }
  loseLife() {
    this.lives--;
    const livesElements = document.querySelectorAll(".life");

    if (livesElements[this.lives]) {
      livesElements[this.lives].classList.add("losing");
      setTimeout(() => {
        livesElements[this.lives].classList.remove("losing");
        livesElements[this.lives].classList.add("lost");
      }, 800);
    }

    if (this.lives <= 0) {
      setTimeout(() => {
        this.gameOver();
      }, 1000);
    }
  }

  nextQuestion() {
    this.clearTimer();

    this.currentQuestion++;
    this.displayQuestion();
  }

  gameOver() {
    this.clearTimer();
    this.pauseTimer();

    // Mark that game is over
    localStorage.setItem("gameOverState", "true");
    const modal = document.getElementById("gameOverModal");
    const title = document.getElementById("gameOverTitle");
    const message = document.getElementById("gameOverMessage");
    const adBtn = document.getElementById("adBtn");

    title.textContent = "Game Over!";
    message.textContent = `You scored ${this.score} points! Your best in ${
      this.currentDifficulty
    } mode is ${this.highScores[this.currentDifficulty]}.`;

    // Show ad button only on first game over (not after ad revive)
    // Show ad button if ads are available (max 2 ads total)
    const totalAdsUsed = parseInt(localStorage.getItem("totalAdsUsed") || "0");
    if (totalAdsUsed < 2) {
      adBtn.style.display = "block";
      adBtn.classList.add("disabled");
    } else {
      adBtn.style.display = "none";
    }

    // If no more ads available, show different message
    if (totalAdsUsed >= 2) {
      title.textContent = "🔒 Progress Reset!";
      message.textContent = `All lives exhausted! Returning to Easy mode. Your score was ${this.score}.`;
      adBtn.style.display = "none";

      // Reset progress
      this.resetAllProgress();
    }

    modal.classList.add("show");
  }

  watchAd() {
    // --- Optionally integrate Pi Payment instead of ad ---
    // this.createPiPayment();

    // Pause timer immediately when ad starts
    this.pauseTimer();

    // Hide the modal
    document.getElementById("gameOverModal").classList.remove("show");

    // Show "watching ad" simulation
    const loadingMsg = document.createElement("div");
    loadingMsg.style.cssText = `
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    background: rgba(0,0,0,0.9); color: white; padding: 30px 50px;
    border-radius: 20px; font-size: 1.2rem; z-index: 2000;
    text-align: center; font-family: 'Fredoka One', cursive;
  `;
    loadingMsg.innerHTML = 'Watching Ad...<div class="loading"></div>';
    document.body.appendChild(loadingMsg);

    setTimeout(() => {
      // Remove fake ad
      document.body.removeChild(loadingMsg);

      // Give extra life
      this.lives = 1;
      this.usedAdRevive = true;
      this.totalAdsUsed++;
      localStorage.setItem("totalAdsUsed", this.totalAdsUsed.toString());
      this.updateUI();
      this.displayQuestion();

      // Resume timer ONLY after life is given + question is shown
      this.resumeTimer();

      // Show success message
      const successMsg = document.createElement("div");
      successMsg.style.cssText = `
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      background: linear-gradient(145deg, #4CAF50, #45a049); color: white; 
      padding: 20px 40px; border-radius: 20px; font-size: 1.3rem; z-index: 2000;
      text-align: center; font-family: 'Fredoka One', cursive;
    `;
      successMsg.textContent = "Extra Life Granted!";
      document.body.appendChild(successMsg);

      setTimeout(() => {
        document.body.removeChild(successMsg);

        if (this.totalAdsUsed >= 2) {
          // Show warning message if no more ads
          const warningMsg = document.createElement("div");
          warningMsg.style.cssText = `
          position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
          background: linear-gradient(145deg, #FF5722, #D84315); color: white; 
          padding: 20px 40px; border-radius: 20px; font-size: 1.1rem; z-index: 2000;
          text-align: center; font-family: 'Fredoka One', cursive; max-width: 400px;
        `;
          warningMsg.textContent =
            "⚠️ No more ads available! Next failure will reset progress.";
          document.body.appendChild(warningMsg);

          // Keep timer paused during warning
          this.pauseTimer();

          setTimeout(() => {
            document.body.removeChild(warningMsg);
            this.resumeTimer(); // Resume only after popup closes
          }, 3000);
        }
      }, 2000);
    }, 3000); // fake ad duration
  }

  // Example: unlock extra life using Pi
  createPiPayment() {
    const paymentData = {
      amount: 0.01, // test Pi
      memo: "Extra life in Flag Game",
      metadata: { feature: "extraLife" },
    };

    const paymentCallbacks = {
      onReadyForServerApproval: (paymentDTO) => {
        fetch("/api/payment/approve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(paymentDTO),
        });
      },
      onReadyForServerCompletion: (paymentDTO, txid) => {
        fetch("/api/payment/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentDTO, txid }),
        });
      },
      onCancel: (paymentDTO) => console.log("Payment cancelled", paymentDTO),
      onError: (err, paymentDTO) =>
        console.error("Payment error", err, paymentDTO),
      onIncompletePaymentFound: (paymentDTO) =>
        console.log("Found incomplete payment", paymentDTO),
    };

    Pi.createPayment(paymentData, paymentCallbacks);
  }

  completeLevel() {
    this.pauseTimer();

    this.clearTimer();

    // Update high score
    if (this.score > this.highScores[this.currentDifficulty]) {
      this.highScores[this.currentDifficulty] = this.score;
      localStorage.setItem(
        "flagGameHighScores",
        JSON.stringify(this.highScores)
      );
    }

    // Unlock next level
    const levelOrder = ["easy", "medium", "hard"];
    const currentIndex = levelOrder.indexOf(this.currentDifficulty);
    if (currentIndex < levelOrder.length - 1) {
      const nextLevel = levelOrder[currentIndex + 1];
      if (!this.unlockedLevels.includes(nextLevel)) {
        this.unlockedLevels.push(nextLevel);
        localStorage.setItem(
          "unlockedLevels",
          JSON.stringify(this.unlockedLevels)
        );
      }
    }

    // Show completion modal
    const modal = document.getElementById("levelCompleteModal");
    const message = document.getElementById("levelCompleteMessage");

    message.textContent = `Amazing! You completed ${this.currentDifficulty} mode with ${this.score} points!`;

    if (this.currentDifficulty === "hard") {
      message.textContent = `CHAMPION! You've mastered all difficulty levels with ${this.score} points!`;
    }

    modal.classList.add("show");
    this.updateDifficultyButtons();
  }

  nextLevel() {
    document.getElementById("levelCompleteModal").classList.remove("show");

    this.resumeTimer();

    const levelOrder = ["easy", "medium", "hard"];
    const currentIndex = levelOrder.indexOf(this.currentDifficulty);

    if (currentIndex < levelOrder.length - 1) {
      this.selectDifficulty(levelOrder[currentIndex + 1]);
    } else {
      // All levels completed, restart from easy
      this.selectDifficulty("easy");
    }
  }

  restartGame() {
    // Clear game over state
    localStorage.removeItem("gameOverState");
    document.getElementById("gameOverModal").classList.remove("show");
    document.getElementById("levelCompleteModal").classList.remove("show");
    this.resetGame();
  }

  updateUI() {
    document.getElementById("currentScore").textContent = this.score;
    document.getElementById("highScore").textContent =
      this.highScores[this.currentDifficulty];

    // Update lives display
    const livesDisplay = document.getElementById("livesDisplay");
    livesDisplay.innerHTML = "";

    for (let i = 0; i < this.maxLives; i++) {
      const life = document.createElement("span");
      life.className = "life";
      life.textContent = "❤️";

      if (i >= this.lives) {
        life.classList.add("lost");
      }

      livesDisplay.appendChild(life);
    }
  }

  resetCurrentQuestion() {
    // Hide next button
    document.getElementById("nextBtn").classList.remove("show");

    // Re-enable all option buttons for the same question
    const question = this.currentQuestions[this.currentQuestion];
    const optionBtns = document.querySelectorAll(".option-btn");

    optionBtns.forEach((btn, index) => {
      // Remove all state classes
      btn.classList.remove("disabled", "wrong", "correct");

      // Make sure button is clickable again
      btn.style.pointerEvents = "auto";
      btn.style.cursor = "pointer";

      // Restore the original onclick functionality
      const option = question.options[index];
      btn.onclick = () => this.selectOption(option, btn);
    });
  }

  resetAllProgress() {
    // Reset to easy level only
    this.unlockedLevels = ["easy"];
    localStorage.setItem("unlockedLevels", JSON.stringify(["easy"]));

    // Reset total ads used
    localStorage.setItem("totalAdsUsed", "0");
    this.totalAdsUsed = 0;

    // Switch to easy difficulty
    this.currentDifficulty = "easy";
    this.updateDifficultyButtons();
  }
}

// Global functions
function goBack() {
  // Clear current game session
  if (game) {
    game.currentQuestion = 0;
    game.score = 0;
    game.currentDifficulty = "easy";
    game.lives = 3;
  }

  // Clear any session storage
  sessionStorage.clear();

  window.location.href = "../../index.html";
}

function selectDifficulty(difficulty) {
  game.selectDifficulty(difficulty);
}

function nextQuestion() {
  game.nextQuestion();
}

function restartGame() {
  game.restartGame();
}

function watchAd() {
  game.watchAd();
}

function showAdComingSoon() {
  const comingSoonMsg = document.createElement("div");
  comingSoonMsg.style.cssText = `
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    background: rgba(0,0,0,0.9); color: #90ee90; padding: 20px 30px;
    border-radius: 15px; font-size: 1rem; z-index: 2000;
    text-align: center; font-family: 'Poppins', sans-serif;
    border: 2px solid rgba(144, 238, 144, 0.3);
  `;
  comingSoonMsg.textContent = "Ad system coming soon!";
  document.body.appendChild(comingSoonMsg);

  setTimeout(() => {
    document.body.removeChild(comingSoonMsg);
  }, 2000);
}

function nextLevel() {
  game.nextLevel();
}

// Initialize game when page loads
let game;
document.addEventListener("DOMContentLoaded", async function () {
  try {
    game = new FlagGame();
  } catch (error) {
    console.error("Failed to initialize game:", error);
    // Show error message to user
    const errorMsg = document.createElement("div");
    errorMsg.style.cssText = `
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      background: rgba(244, 67, 54, 0.9); color: white; padding: 20px 30px;
      border-radius: 15px; font-size: 1rem; z-index: 2000;
      text-align: center; font-family: 'Poppins', sans-serif;
    `;
    errorMsg.innerHTML = `
      <h3>Failed to load game</h3>
      <p>Please make sure the server is running and try again.</p>
      <button onclick="window.location.reload()" style="margin-top: 10px; padding: 10px 20px; background: white; color: #f44336; border: none; border-radius: 5px; cursor: pointer;">Retry</button>
    `;
    document.body.appendChild(errorMsg);
  }

  // Add keyboard shortcuts
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      goBack();
    } else if (
      e.key === "Enter" &&
      document.getElementById("nextBtn").classList.contains("show")
    ) {
      nextQuestion();
    } else if (e.key >= "1" && e.key <= "4") {
      const optionBtns = document.querySelectorAll(
        ".option-btn:not(.disabled)"
      );
      const index = parseInt(e.key) - 1;
      if (optionBtns[index]) {
        optionBtns[index].click();
      }
    }
  });

  // Prevent right-click for cleaner experience
  document.addEventListener("contextmenu", function (e) {
    e.preventDefault();
  });

  // Add sound effects simulation
  const playSound = (type) => {
    // In a real implementation, you would play actual sound files
    console.log(`Playing ${type} sound`);
  };

  // Add particle effects on correct answers
  const createConfetti = () => {
    for (let i = 0; i < 50; i++) {
      const confetti = document.createElement("div");
      confetti.style.cssText = `
        position: fixed;
        width: 10px;
        height: 10px;
        background: ${
          ["#4CAF50", "#90EE90", "#FFD700", "#FF9800"][
            Math.floor(Math.random() * 4)
          ]
        };
        top: 50%;
        left: 50%;
        border-radius: 50%;
        pointer-events: none;
        z-index: 1000;
        animation: confetti 2s ease-out forwards;
      `;

      const style = document.createElement("style");
      style.textContent = `
        @keyframes confetti {
          0% {
            transform: translate(0, 0) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translate(${(Math.random() - 0.5) * 600}px, ${
        Math.random() * 600 + 200
      }px) rotate(${Math.random() * 720}deg);
            opacity: 0;
          }
        }
      `;

      if (!document.querySelector("#confetti-styles")) {
        style.id = "confetti-styles";
        document.head.appendChild(style);
      }

      document.body.appendChild(confetti);
      setTimeout(() => {
        document.body.removeChild(confetti);
      }, 2000);
    }
  };

  // Override the showCorrectPopup method to add confetti
  if (game) {
    const originalShowCorrectPopup = game.showCorrectPopup;
    game.showCorrectPopup = function () {
      originalShowCorrectPopup.call(this);
      createConfetti();
    };
  }
});

// Add some ambient forest sounds simulation
function addAmbientSounds() {
  // Simulate forest ambience
  setInterval(() => {
    if (Math.random() < 0.1) {
      // 10% chance every interval
      console.log("Bird chirping");
    }
    if (Math.random() < 0.05) {
      // 5% chance
      console.log("Leaves rustling");
    }
  }, 5000);
}

// Initialize ambient sounds
setTimeout(addAmbientSounds, 2000);

// Add some visual enhancements
document.addEventListener("DOMContentLoaded", function () {
  // Create floating particles in background
  function createBackgroundParticles() {
    setInterval(() => {
      const particle = document.createElement("div");
      particle.style.cssText = `
        position: fixed;
        width: ${Math.random() * 4 + 2}px;
        height: ${Math.random() * 4 + 2}px;
        background: rgba(144, 238, 144, 0.3);
        border-radius: 50%;
        top: 100vh;
        left: ${Math.random() * 100}vw;
        pointer-events: none;
        z-index: -1;
        animation: floatUp ${Math.random() * 10 + 15}s linear forwards;
      `;

      const style = document.createElement("style");
      style.textContent = `
        @keyframes floatUp {
          0% {
            transform: translateY(0) rotate(0deg);
            opacity: 0;
          }
          10% {
            opacity: 1;
          }
          90% {
            opacity: 1;
          }
          100% {
            transform: translateY(-100vh) rotate(360deg);
            opacity: 0;
          }
        }
      `;

      if (!document.querySelector("#particle-styles")) {
        style.id = "particle-styles";
        document.head.appendChild(style);
      }

      document.body.appendChild(particle);
      setTimeout(() => {
        if (particle.parentNode) {
          document.body.removeChild(particle);
        }
      }, 25000);
    }, 500);
  }

  createBackgroundParticles();
});

// Performance optimization - preload next flag image
function preloadNextFlag() {
  if (game && game.currentQuestion + 1 < game.currentQuestions.length) {
    const nextQuestion = game.currentQuestions[game.currentQuestion + 1];
    const img = new Image();
    img.src = nextQuestion.country.flag;
  }
}

// Call preload after each question
const originalNextQuestion = nextQuestion;
window.nextQuestion = function () {
  originalNextQuestion();
  setTimeout(preloadNextFlag, 100);
};
