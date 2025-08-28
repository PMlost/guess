// Loading Screen Animation
window.addEventListener("load", function () {
  setTimeout(() => {
    document.getElementById("loadingScreen").classList.add("hidden");
    setTimeout(() => {
      document.getElementById("mainContent").classList.add("visible");
      createParticles();
    }, 800);
  }, 3500); // Show loading for 3.5 seconds
});

// Create floating particles effect
function createParticles() {
  // Create a particle container if it doesn't exist
  let particleContainer = document.getElementById("particle-container");
  if (!particleContainer) {
    particleContainer = document.createElement("div");
    particleContainer.id = "particle-container";
    particleContainer.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100vh;
      pointer-events: none;
      z-index: -1;
      overflow: hidden;
    `;
    document.body.appendChild(particleContainer);
  }

  setInterval(() => {
    const particle = document.createElement("div");
    particle.className = "particle";
    particle.style.left = Math.random() * window.innerWidth + "px";
    particle.style.width = particle.style.height = Math.random() * 4 + 2 + "px";
    particle.style.animationDelay = Math.random() * 6 + "s";
    particle.style.animationDuration = Math.random() * 4 + 6 + "s";

    // Append to container instead of body
    particleContainer.appendChild(particle);

    setTimeout(() => {
      if (particle.parentNode) {
        particle.remove();
      }
    }, 10000);
  }, 300);
}

// Game Selection
function selectGame(gameType) {
  if (gameType === "flag") {
    document.getElementById("flagGameModal").style.display = "flex";
  }
}

function closeFlagModal() {
  document.getElementById("flagGameModal").style.display = "none";
}

function startFlagGame() {
  localStorage.setItem("currentGame", "flag");
  localStorage.setItem("gameStarting", "true");
  // Fixed path:
  window.location.href = "games/flag-guess/flag-game.html";
}

// Add click sounds and visual feedback
document.addEventListener("DOMContentLoaded", function () {
  const gameCards = document.querySelectorAll(".game-card:not(.locked)");
  gameCards.forEach((card) => {
    card.addEventListener("mousedown", function () {
      this.style.transform = "translateY(-5px) scale(0.98)";
    });

    card.addEventListener("mouseup", function () {
      this.style.transform = "translateY(-10px) scale(1.02)";
    });
  });
});

// Prevent right-click context menu for cleaner experience
document.addEventListener("contextmenu", function (e) {
  e.preventDefault();
});

// Add keyboard shortcuts
document.addEventListener("keydown", function (e) {
  if (e.key === "1" || e.key === "f" || e.key === "F") {
    selectGame("flag");
  } else if (e.key === "Escape") {
    closeFlagModal();
  } else if (
    e.key === "Enter" &&
    document.getElementById("flagGameModal").style.display === "flex"
  ) {
    startFlagGame();
  }
});
