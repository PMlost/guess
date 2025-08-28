// server.js
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs").promises;

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../frontend")));

// In-memory storage (replace with database in production)
let gameData = {
  users: new Map(),
  scores: new Map(),
  gameProgress: new Map(),
};

// Load countries data
let countriesData = [];

async function loadCountriesData() {
  try {
    const data = await fs.readFile(
      path.join(__dirname, "data", "flagname.json"),
      "utf8"
    );
    const parsed = JSON.parse(data);
    countriesData = parsed.countries || [];
    console.log(`Loaded ${countriesData.length} countries`);
  } catch (error) {
    console.error("Error loading countries data:", error);
    console.error("Server will not function properly without countries data");
    countriesData = []; // Keep empty, no hardcoded fallback
  }
}

// Routes
// Add this after line 255
app.get("/games/flag-guess/flag-game.html", (req, res) => {
  res.sendFile(
    path.join(__dirname, "../frontend/games/flag-guess", "flag-game.html")
  );
});
// Get all countries or filter by difficulty
app.get("/api/countries", (req, res) => {
  if (countriesData.length === 0) {
    return res.status(503).json({
      success: false,
      error: "Countries data not loaded. Please check server logs.",
    });
  }
  try {
    const { difficulty } = req.query;

    let filteredCountries = countriesData;

    if (difficulty) {
      filteredCountries = countriesData.filter(
        (country) => country.difficulty === difficulty
      );
    }

    res.json({
      success: true,
      data: filteredCountries,
      total: filteredCountries.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch countries",
    });
  }
});

// Get random questions for a specific difficulty
app.get("/api/questions/:difficulty/:count", (req, res) => {
  if (countriesData.length === 0) {
    return res.status(503).json({
      success: false,
      error: "Countries data not loaded. Cannot generate questions.",
    });
  }
  try {
    const { difficulty, count } = req.params;
    const questionCount = parseInt(count) || 10;

    const difficultyCountries = countriesData.filter(
      (country) => country.difficulty === difficulty
    );

    if (difficultyCountries.length < 4) {
      return res.status(400).json({
        success: false,
        error: "Not enough countries for this difficulty",
      });
    }

    const questions = [];

    // Replace the entire for loop section in your questions endpoint with this:

    const usedCountries = new Set();

    for (
      let i = 0;
      i < questionCount && usedCountries.size < difficultyCountries.length;
      i++
    ) {
      // Pick a random correct answer that hasn't been used
      let correctAnswer;
      let attempts = 0;

      do {
        correctAnswer =
          difficultyCountries[
            Math.floor(Math.random() * difficultyCountries.length)
          ];
        attempts++;
      } while (usedCountries.has(correctAnswer.id) && attempts < 100);

      // If we can't find an unused country, break to avoid infinite loop
      if (usedCountries.has(correctAnswer.id)) {
        break;
      }

      // Add to used countries
      usedCountries.add(correctAnswer.id);

      // Pick 3 random wrong answers from the same difficulty (excluding used ones)
      const availableWrongAnswers = difficultyCountries.filter(
        (country) =>
          country.id !== correctAnswer.id && !usedCountries.has(country.id)
      );

      // If we don't have enough countries for wrong answers, include some used ones
      const allWrongAnswers =
        availableWrongAnswers.length >= 3
          ? availableWrongAnswers
          : difficultyCountries.filter(
              (country) => country.id !== correctAnswer.id
            );

      const wrongAnswers = allWrongAnswers
        .sort(() => Math.random() - 0.5)
        .slice(0, 3);

      // Combine and shuffle all options
      const allOptions = [correctAnswer, ...wrongAnswers].sort(
        () => Math.random() - 0.5
      );

      questions.push({
        id: i + 1,
        country: correctAnswer,
        options: allOptions,
        correctAnswerId: correctAnswer.id,
      });
    }

    res.json({
      success: true,
      data: questions,
      difficulty: difficulty,
      total: questions.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to generate questions",
    });
  }
});

// Save user score
app.post("/api/scores", (req, res) => {
  try {
    const {
      userId,
      gameType,
      difficulty,
      score,
      questionsAnswered,
      correctAnswers,
    } = req.body;

    if (!userId || !gameType || !difficulty || score === undefined) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields",
      });
    }

    const scoreData = {
      userId,
      gameType,
      difficulty,
      score,
      questionsAnswered: questionsAnswered || 0,
      correctAnswers: correctAnswers || 0,
      timestamp: new Date().toISOString(),
      accuracy:
        questionsAnswered > 0 ? (correctAnswers / questionsAnswered) * 100 : 0,
    };

    // Create unique score ID
    const scoreId = `${userId}_${gameType}_${difficulty}_${Date.now()}`;
    gameData.scores.set(scoreId, scoreData);

    // Update user's best score for this difficulty
    const userKey = `${userId}_${gameType}_${difficulty}`;
    const existingBest = gameData.gameProgress.get(userKey) || {
      bestScore: 0,
      unlockedLevels: ["easy"],
    };

    if (score > existingBest.bestScore) {
      existingBest.bestScore = score;

      // Unlock next difficulty level
      const difficultyOrder = ["easy", "medium", "hard"];
      const currentIndex = difficultyOrder.indexOf(difficulty);
      if (currentIndex >= 0 && currentIndex < difficultyOrder.length - 1) {
        const nextDifficulty = difficultyOrder[currentIndex + 1];
        if (!existingBest.unlockedLevels.includes(nextDifficulty)) {
          existingBest.unlockedLevels.push(nextDifficulty);
        }
      }

      gameData.gameProgress.set(userKey, existingBest);
    }

    res.json({
      success: true,
      data: {
        scoreId,
        newBestScore: score > (existingBest.bestScore || 0),
        bestScore: Math.max(score, existingBest.bestScore || 0),
        unlockedLevels: existingBest.unlockedLevels,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to save score",
    });
  }
});

// Get user's scores and progress
app.get("/api/user/:userId/progress", (req, res) => {
  try {
    const { userId } = req.params;
    const { gameType = "flag" } = req.query;

    const progress = {};
    const difficulties = ["easy", "medium", "hard"];

    difficulties.forEach((difficulty) => {
      const userKey = `${userId}_${gameType}_${difficulty}`;
      const userProgress = gameData.gameProgress.get(userKey) || {
        bestScore: 0,
        unlockedLevels: difficulty === "easy" ? ["easy"] : [],
      };
      progress[difficulty] = userProgress.bestScore;
    });

    // Get unlocked levels
    const easyProgress = gameData.gameProgress.get(
      `${userId}_${gameType}_easy`
    );
    const unlockedLevels = easyProgress
      ? easyProgress.unlockedLevels
      : ["easy"];

    // Get recent scores
    const userScores = Array.from(gameData.scores.values())
      .filter((score) => score.userId === userId && score.gameType === gameType)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 10);

    res.json({
      success: true,
      data: {
        highScores: progress,
        unlockedLevels,
        recentScores: userScores,
        totalGamesPlayed: userScores.length,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch user progress",
    });
  }
});

// Get leaderboard
app.get("/api/leaderboard/:gameType/:difficulty", (req, res) => {
  try {
    const { gameType, difficulty } = req.params;
    const { limit = 10 } = req.query;

    const scores = Array.from(gameData.scores.values())
      .filter(
        (score) =>
          score.gameType === gameType && score.difficulty === difficulty
      )
      .sort((a, b) => b.score - a.score)
      .slice(0, parseInt(limit));

    // Group by user and get best score per user
    const userBestScores = {};
    scores.forEach((score) => {
      if (
        !userBestScores[score.userId] ||
        userBestScores[score.userId].score < score.score
      ) {
        userBestScores[score.userId] = score;
      }
    });

    const leaderboard = Object.values(userBestScores)
      .sort((a, b) => b.score - a.score)
      .slice(0, parseInt(limit))
      .map((score, index) => ({
        rank: index + 1,
        userId: score.userId,
        score: score.score,
        accuracy: score.accuracy,
        timestamp: score.timestamp,
      }));

    res.json({
      success: true,
      data: leaderboard,
      gameType,
      difficulty,
      total: leaderboard.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch leaderboard",
    });
  }
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    status: "OK",
    timestamp: new Date().toISOString(),
    countriesLoaded: countriesData.length,
  });
});

// Serve frontend files
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend", "index.html"));
});

app.get("/flag-game", (req, res) => {
  res.sendFile(
    path.join(__dirname, "../frontend/games/flag-guess", "flag-game.html")
  );
});

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    error: "Route not found",
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error("Server Error:", error);
  res.status(500).json({
    success: false,
    error: "Internal server error",
  });
});

// Initialize server
async function startServer() {
  try {
    await loadCountriesData();

    app.listen(PORT, () => {
      console.log(`🌳 GuessPop server running on http://localhost:${PORT}`);
      console.log(`🏳️ Loaded ${countriesData.length} countries`);
      console.log(`🎮 Ready to serve flag guessing game!`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on("SIGTERM", () => {
  console.log("Server shutting down gracefully...");
  // In a real app, you'd save data to database here
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("Server interrupted, shutting down gracefully...");
  process.exit(0);
});

startServer();
