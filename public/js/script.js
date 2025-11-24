// Initialize socket connection at the top level (only once)
var socket = io('http://localhost:3000');

// Socket event handlers
socket.on('data', function (data) {
  log(data);
});

var alerted = false;

// État du drone
var droneStatus = {
  jumpReady: true,
  motorOK: true,
  battery: 100
};

socket.on('battery', function (data) {
  droneStatus.battery = data;
  
  var element = document.getElementById("battery_num");
  if (element) {
    element.innerHTML = data.toString() + '%';
  }

  var progress = document.getElementById("battery-value");
  if (progress) {
    progress.setAttribute("value", data);
  }
  
  // Vibration de la manette si batterie faible
  checkBatteryVibration(data);
});

// Fonction pour faire vibrer la manette si batterie faible
function checkBatteryVibration(batteryLevel) {
  var gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
  var gp = gamepads[0];
  
  if (!gp || !gp.vibrationActuator) return;
  
  // Batterie critique (< 5%) : vibration forte continue
  if (batteryLevel < 5 && !gamepadState.lowBatteryVibrating) {
    gamepadState.lowBatteryVibrating = true;
    gp.vibrationActuator.playEffect("dual-rumble", {
      startDelay: 0,
      duration: 2000,
      weakMagnitude: 0.7,
      strongMagnitude: 1.0
    });
    log(t('log-battery-critical'));
    
    // Répéter la vibration toutes les 10 secondes tant que la batterie est faible
    if (!gamepadState.lowBatteryInterval) {
      gamepadState.lowBatteryInterval = setInterval(function() {
        var currentGamepads = navigator.getGamepads ? navigator.getGamepads() : [];
        var currentGp = currentGamepads[0];
        if (currentGp && currentGp.vibrationActuator && droneStatus.battery < 5) {
          currentGp.vibrationActuator.playEffect("dual-rumble", {
            startDelay: 0,
            duration: 1500,
            weakMagnitude: 0.7,
            strongMagnitude: 1.0
          });
        } else if (droneStatus.battery >= 5) {
          clearInterval(gamepadState.lowBatteryInterval);
          gamepadState.lowBatteryInterval = null;
          gamepadState.lowBatteryVibrating = false;
        }
      }, 10000);
    }
  }
  // Batterie faible (< 10%) : vibration légère d'avertissement unique
  else if (batteryLevel < 10 && batteryLevel >= 5 && !gamepadState.lowBatteryVibrating) {
    gp.vibrationActuator.playEffect("dual-rumble", {
      startDelay: 0,
      duration: 800,
      weakMagnitude: 0.3,
      strongMagnitude: 0.5
    });
    log(t('log-battery-low-warning') + ' (' + batteryLevel + '%)');
  }
  // Batterie redevenue normale
  else if (batteryLevel >= 10 && gamepadState.lowBatteryVibrating) {
    gamepadState.lowBatteryVibrating = false;
    if (gamepadState.lowBatteryInterval) {
      clearInterval(gamepadState.lowBatteryInterval);
      gamepadState.lowBatteryInterval = null;
    }
    log(t('log-battery-ok') + ' (' + batteryLevel + '%)');
  }
}

// ===== NOUVEAUX ÉVÉNEMENTS =====

// Alertes de batterie
socket.on('alert', function(data) {
  console.log('🚨 ALERTE:', data.message);
  log(data.icon + ' ' + data.message);
  
  // Afficher une alerte visuelle si critique
  if (data.type === 'critical' || data.type === 'error') {
    showAlert(data.message, data.icon);
  }
});

// État du saut
socket.on('jumpStatus', function(data) {
  droneStatus.jumpReady = data.ready;
  console.log('🦘 Jump Status:', data.message);
  log('🦘 ' + data.message);
});

// État du moteur
socket.on('motorStatus', function(data) {
  droneStatus.motorOK = data.ok;
  console.log('⚙️ Motor Status:', data.message);
  log('⚙️ ' + data.message);
});

// Changement de posture
socket.on('postureChanged', function(data) {
  console.log('🤸 Posture:', data.posture);
  log(data.icon + ' Posture: ' + data.posture);
});

// Erreurs
socket.on('error', function(message) {
  console.error('❌ Erreur:', message);
  log('❌ ' + message);
  showAlert(message, '❌');
});

// État du drone au démarrage
socket.on('droneState', function(state) {
  droneStatus = {
    jumpReady: state.jumpReady,
    motorOK: state.motorOK,
    battery: state.battery
  };
  console.log('📊 État du drone:', state);
});

// Fonction pour afficher une alerte visuelle
function showAlert(message, icon) {
  const alert = document.createElement('div');
  alert.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: rgba(220, 38, 38, 0.95);
    color: white;
    padding: 20px 30px;
    border-radius: 10px;
    font-weight: bold;
    font-size: 18px;
    z-index: 9999;
    box-shadow: 0 4px 15px rgba(0,0,0,0.3);
    animation: slideIn 0.3s ease-out;
  `;
  alert.textContent = icon + ' ' + message;
  document.body.appendChild(alert);
  
  setTimeout(() => {
    alert.style.animation = 'slideOut 0.3s ease-in';
    setTimeout(() => alert.remove(), 300);
  }, 3000);
}

// Global variables
var start;
var ball = document.getElementById("ball");
var ball2 = document.getElementById("ball2");
var a = 55;
var b = 55;
var aa = 55;
var bb = 55;

// Gamepad control state tracking
var gamepadState = {
  previousButtons: {},
  movementActive: {
    forward: false,
    backward: false,
    left: false,
    right: false
  },
  lowBatteryVibrating: false,
  lowBatteryInterval: null
};

var rAF =
  window.mozRequestAnimationFrame ||
  window.webkitRequestAnimationFrame ||
  window.requestAnimationFrame;

var rAFStop =
  window.mozCancelRequestAnimationFrame ||
  window.webkitCancelRequestAnimationFrame ||
  window.cancelRequestAnimationFrame;

// Gamepad connection event
window.addEventListener("gamepadconnected", function (e) {
  var gp = navigator.getGamepads()[e.gamepad.index];

  log(t('log-gamepad-connected') + ' ' + gp.id);

  // Initialize button state tracking
  for (var i = 0; i < gp.buttons.length; i++) {
    gamepadState.previousButtons[i] = false;
  }

  // Demander l'état du drone au démarrage
  socket.emit('getState');

  gameLoop();
});

// Gamepad disconnection event
window.addEventListener("gamepaddisconnected", function (e) {
  log(t('log-gamepad-disconnected'));
  
  var stateEl = document.getElementById("State");
  if (stateEl) {
    stateEl.innerHTML = "No controller Detected";
    stateEl.classList.remove("connected");
  }
  
  var detailsEls = ["Details", "Details2", "Details3", "Details4"];
  detailsEls.forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.style.display = "none";
  });
  
  if (ball) ball.style.display = "none";
  if (ball2) ball2.style.display = "none";

  // Stop all movement when controller disconnects
  stopAllMovement();

  rAFStop(start);
});

// Fallback for browsers without GamepadEvent
if (!("GamepadEvent" in window)) {
  var interval = setInterval(pollGamepads, 500);
}

function pollGamepads() {
  var gamepads = navigator.getGamepads
    ? navigator.getGamepads()
    : navigator.webkitGetGamepads
    ? navigator.webkitGetGamepads()
    : [];
  for (var i = 0; i < gamepads.length; i++) {
    var gp = gamepads[i];
    if (gp) {
      // Initialize button states
      for (var j = 0; j < gp.buttons.length; j++) {
        gamepadState.previousButtons[j] = false;
      }
      gameLoop();
      clearInterval(interval);
    }
  }
}

// Stop all movement commands
function stopAllMovement() {
  if (gamepadState.movementActive.forward) {
    socket.emit('keyup', 'forward');
    gamepadState.movementActive.forward = false;
  }
  if (gamepadState.movementActive.backward) {
    socket.emit('keyup', 'backward');
    gamepadState.movementActive.backward = false;
  }
  if (gamepadState.movementActive.left) {
    socket.emit('keyup', 'left');
    gamepadState.movementActive.left = false;
  }
  if (gamepadState.movementActive.right) {
    socket.emit('keyup', 'right');
    gamepadState.movementActive.right = false;
  }
}

// Vérifier si on peut sauter
function canJump() {
  if (!droneStatus.jumpReady) {
    console.error('❌ Saut pas prêt!');
    log(t('log-jump-not-ready'));
    return false;
  }
  
  if (!droneStatus.motorOK) {
    console.error('❌ Moteur en erreur!');
    log(t('log-motor-error'));
    return false;
  }
  
  if (droneStatus.battery < 15) {
    console.error('⚠️ Batterie trop faible pour sauter!');
    log(t('log-battery-low') + ' (' + droneStatus.battery + '%)');
    return false;
  }
  
  return true;
}

// Handle left stick movement (avant/arrière uniquement)
function handleLeftStick(axes) {
  var deadzone = 0.2;
  var y = Math.abs(axes[1]) > deadzone ? axes[1] : 0;

  // Forward/Backward (Y-axis)
  if (y < -deadzone && !gamepadState.movementActive.forward) {
    socket.emit('keydown', 'forward');
    gamepadState.movementActive.forward = true;
    gamepadState.movementActive.backward = false;
    animateButton('up-btn', true);
    log(t('log-forward'));
  } else if (y > deadzone && !gamepadState.movementActive.backward) {
    socket.emit('keydown', 'backward');
    gamepadState.movementActive.backward = true;
    gamepadState.movementActive.forward = false;
    animateButton('down-btn', true);
    log(t('log-backward'));
  } else if (Math.abs(y) <= deadzone) {
    if (gamepadState.movementActive.forward) {
      socket.emit('keyup', 'forward');
      gamepadState.movementActive.forward = false;
      animateButton('up-btn', false);
    }
    if (gamepadState.movementActive.backward) {
      socket.emit('keyup', 'backward');
      gamepadState.movementActive.backward = false;
      animateButton('down-btn', false);
    }
  }
}

// Handle right stick movement (gauche/droite uniquement)
function handleRightStick(axes) {
  var deadzone = 0.2;
  var x = Math.abs(axes[2]) > deadzone ? axes[2] : 0;

  // Left/Right (X-axis du stick droit)
  if (x < -deadzone && !gamepadState.movementActive.left) {
    socket.emit('keydown', 'left');
    gamepadState.movementActive.left = true;
    gamepadState.movementActive.right = false;
    animateButton('left-btn', true);
    log(t('log-left'));
  } else if (x > deadzone && !gamepadState.movementActive.right) {
    socket.emit('keydown', 'right');
    gamepadState.movementActive.right = true;
    gamepadState.movementActive.left = false;
    animateButton('right-btn', true);
    log(t('log-right'));
  } else if (Math.abs(x) <= deadzone) {
    if (gamepadState.movementActive.left) {
      socket.emit('keyup', 'left');
      gamepadState.movementActive.left = false;
      animateButton('left-btn', false);
    }
    if (gamepadState.movementActive.right) {
      socket.emit('keyup', 'right');
      gamepadState.movementActive.right = false;
      animateButton('right-btn', false);
    }
  }
}

// Fonction pour animer visuellement les boutons
function animateButton(buttonId, isActive) {
  var button = document.getElementById(buttonId);
  if (!button) return;
  
  if (isActive) {
    button.classList.add('btn-active');
  } else {
    button.classList.remove('btn-active');
  }
}

// Handle button presses for actions
function handleButtonPress(button, buttonIndex) {
  // Check if this is a new press (wasn't pressed before)
  if (button.pressed && !gamepadState.previousButtons[buttonIndex]) {
    switch(buttonIndex) {
      case 0: // A button
        socket.emit('action', 'tap');
        log(t('log-tap'));
        flashButton('tap-btn');
        break;
      case 1: // B button
        socket.emit('action', 'slowshake');
        log(t('log-slowshake'));
        flashButton('slowshake-btn');
        break;
      case 2: // X button
        socket.emit('action', 'spin');
        log(t('log-spin'));
        flashButton('spin-btn');
        break;
      case 3: // Y button
        socket.emit('action', 'jumper');
        log(t('log-jumper'));
        flashButton('posture-jumper-btn');
        break;
      case 4: // LB - High Jump avec vérification
        if (canJump()) {
          socket.emit('action', 'jump');
          log(t('log-high-jump'));
          flashButton('jump-btn');
        }
        break;
      case 5: // RB - Ondulation
        socket.emit('action', 'ondulation');
        log(t('log-ondulation'));
        flashButton('ondulation-btn');
        break;
      case 6: // LT
        if (button.value > 0.5) {
          if (canJump()) {
            socket.emit('action', 'longJump');
            log(t('log-long-jump'));
            flashButton('longjump-btn');
          }
        }
        break;
      case 7: // RT
        if (button.value > 0.5) {
          socket.emit('action', 'standing');
          log(t('log-standing'));
          flashButton('posture-standing-btn');
        }
        break;
      case 8: // Select/Back
        if (canJump()) {
          socket.emit('action', 'spinjump');
          log(t('log-spin-jump'));
          flashButton('spinjump-btn');
        }
        break;
      case 9: // Start/Menu
        socket.emit('action', 'spintoposture');
        log(t('log-spin-to-posture'));
        flashButton('spintoposture-btn');
        break;
      case 10: // Left Stick Click
       socket.emit('action', 'jumper');
        log(t('log-jumper'));
        flashButton('posture-jumper-btn');
        break;
      case 11: // Right Stick Click
        socket.emit('action', 'metronome');
        log(t('log-metronome'));
        flashButton('posture-standing-btn');
        break;
      case 12: // D-pad Up
        if (canJump()) {
          log(t('log-kick-jump'));
          socket.emit('action', 'longJump');
          flashButton('push-btn');
        }
        break;
      case 13: // D-pad Down
        socket.emit('action', 'kicker');
        log(t('log-kicker'));
        flashButton('posture-kicker-btn');
        break;
      case 14: // D-pad Left
        socket.emit('action', 'spiral');
        log(t('log-spiral'));
        flashButton('spiral-btn');
        break;
      case 15: // D-pad Right
        socket.emit('action', 'slalom');
        log(t('log-slalom'));
        flashButton('slalom-btn');
        break;
    }
  }
  
  // Update previous button state
  gamepadState.previousButtons[buttonIndex] = button.pressed;
}

// Fonction pour faire clignoter un bouton (flash)
function flashButton(buttonId) {
  var button = document.getElementById(buttonId);
  if (!button) return;
  
  button.classList.add('btn-flash');
  setTimeout(function() {
    button.classList.remove('btn-flash');
  }, 300);
}

// Main game loop - handles all gamepad input and updates
function gameLoop() {
  var gamepads = navigator.getGamepads
    ? navigator.getGamepads()
    : navigator.webkitGetGamepads
    ? navigator.webkitGetGamepads()
    : [];
  if (!gamepads) return;

  var gp = gamepads[0];

  if (gp) {
    // Handle left stick for drone movement (avant/arrière)
    handleLeftStick(gp.axes);
    
    // Handle right stick for drone movement (gauche/droite)
    handleRightStick(gp.axes);

    // Handle all button presses
    for (var i = 0; i < gp.buttons.length; i++) {
      handleButtonPress(gp.buttons[i], i);
    }

    // Visual feedback - Left stick controls (axes 0 and 1)
    if (gp.axes[1] < -0.2) {
      b--;
    } else if (gp.axes[1] > 0.2) {
      b++;
    }
    if (gp.axes[0] < -0.2) {
      a--;
    } else if (gp.axes[0] > 0.2) {
      a++;
    }

    // Visual feedback - Right stick controls (axes 2 and 3)
    if (gp.axes[3] < -0.2) {
      bb--;
    } else if (gp.axes[3] > 0.2) {
      bb++;
    }
    if (gp.axes[2] < -0.2) {
      aa--;
    } else if (gp.axes[2] > 0.2) {
      aa++;
    }

    // Update axes display
    var axesX = document.getElementById("controller-axes-x");
    var axesY = document.getElementById("controller-axes-y");
    var axes2X = document.getElementById("controller-axes2-x");
    var axes2Y = document.getElementById("controller-axes2-y");
    
    if (axesX) axesX.innerHTML = gp.axes[0].toFixed(2);
    if (axesY) axesY.innerHTML = gp.axes[1].toFixed(2);
    if (axes2X) axes2X.innerHTML = gp.axes[2].toFixed(2);
    if (axes2Y) axes2Y.innerHTML = gp.axes[3].toFixed(2);

    // Update trigger display
    var triggerLeft = document.getElementById("controller-trigger-left");
    var triggerRight = document.getElementById("controller-trigger-right");
    
    if (triggerLeft) triggerLeft.innerHTML = gp.buttons[6]["value"].toFixed(2);
    if (triggerRight) triggerRight.innerHTML = gp.buttons[7]["value"].toFixed(2);

    // Update button states (A, B, X, Y)
    updateButtonState(gp.buttons[0], "a-btn");
    updateButtonState(gp.buttons[1], "b-btn");
    updateButtonState(gp.buttons[2], "x-btn");
    updateButtonState(gp.buttons[3], "y-btn");

    // Update D-pad buttons (pas left-btn et right-btn car ce sont nos boutons de navigation!)
    updateButtonState(gp.buttons[12], "top-btn");
    updateButtonState(gp.buttons[13], "bottom-btn");
    // updateButtonState(gp.buttons[14], "left-btn");  // DÉSACTIVÉ - conflit avec bouton navigation
    // updateButtonState(gp.buttons[15], "right-btn"); // DÉSACTIVÉ - conflit avec bouton navigation

    // Update shoulder buttons
    updateButtonState(gp.buttons[5], "rb-btn");
    updateButtonState(gp.buttons[4], "lb-btn");

    // Update trigger buttons
    updateButtonState(gp.buttons[7], "rt-btn");
    updateButtonState(gp.buttons[6], "lt-btn");

    // Update special buttons
    updateButtonState(gp.buttons[8], "minileft-btn");
    updateButtonState(gp.buttons[9], "miniright-btn");
    updateButtonState(gp.buttons[10], "leftaxe-btn");
    updateButtonState(gp.buttons[11], "rightaxe-btn");

    // Update ball positions
    if (ball) {
      ball.style.left = a * 5 + "px";
      ball.style.top = b * 5 + "px";
    }

    if (ball2) {
      ball2.style.left = aa * 5 + "px";
      ball2.style.top = bb * 5 + "px";
    }
  }

  start = rAF(gameLoop);
}

// Helper function to update button states
function updateButtonState(button, elementId) {
  var element = document.getElementById(elementId);
  if (!element) return;

  if (button["touched"]) {
    if (button["pressed"]) {
      element.innerHTML = "Pressed";
    }
  } else {
    element.innerHTML = "None";
  }
}

///////////Mobile logs//////////////
function log(msg) {
  const container = document.getElementById("log");
  if (container) {
    container.textContent = `${msg}\n${container.textContent}`;
  }
  console.log(msg); // Also log to console
}

///////////Mobile control//////////////
function startup() {
  const left = document.getElementById("left-btn");
  if (left) {
    left.addEventListener("touchstart", leftStart);
    left.addEventListener("touchend", leftEnd);
    left.addEventListener("mousedown", leftStart);
    left.addEventListener("mouseup", leftEnd);
    log("⬅️ 👍");
  }

  const right = document.getElementById("right-btn");
  if (right) {
    right.addEventListener("touchstart", rightStart);
    right.addEventListener("touchend", rightEnd);
    right.addEventListener("mousedown", rightStart);
    right.addEventListener("mouseup", rightEnd);
    log("➡️ 👍");
  }

  const up = document.getElementById("up-btn");
  if (up) {
    up.addEventListener("touchstart", upStart);
    up.addEventListener("touchend", upEnd);
    up.addEventListener("mousedown", upStart);
    up.addEventListener("mouseup", upEnd);
    log("⬆️ 👍");
  }

  const down = document.getElementById("down-btn");
  if (down) {
    down.addEventListener("touchstart", downStart);
    down.addEventListener("touchend", downEnd);
    down.addEventListener("mousedown", downStart);
    down.addEventListener("mouseup", downEnd);
    log("⬇️ 👍");
  }
}

document.addEventListener("DOMContentLoaded", startup);

// Mobile control functions
function leftStart() {
  log('⬅️');
  socket.emit('keydown', 'left');
}
function leftEnd() {
  log(t('log-stop'));
  socket.emit('keyup', 'left');
}

function rightStart() {
  log('➡️');
  socket.emit('keydown', 'right');
}
function rightEnd() {
  log(t('log-stop'));
  socket.emit('keyup', 'right');
}

function upStart() {
  log('⬆️');
  socket.emit('keydown', 'forward');
}
function upEnd() {
  log(t('log-stop'));
  socket.emit('keyup', 'forward');
}

function downStart() {
  log('⬇️');
  socket.emit('keydown', 'backward');
}
function downEnd() {
  log(t('log-stop'));
  socket.emit('keyup', 'backward');
}

///////////////////////////////////////
/// TOOLBOX moves - avec vérifications pour les sauts
function jsJumpFunction() {
  if (canJump()) {
    log(t('log-high-jump'));
    socket.emit('action', 'jump');
    flashButton('jump-btn');
  }
}

function jsLongJumpFunction() {
  if (canJump()) {
    log(t('log-long-jump'));
    socket.emit('action', 'longJump');
    flashButton('longjump-btn');
  }
}

function jsSpinFunction() {
  log(t('log-spin'));
  socket.emit('action', 'spin');
  flashButton('spin-btn');
}

function jsSlowShakeFunction() {
  log(t('log-slowshake'));
  socket.emit('action', 'slowshake');
  flashButton('slowshake-btn');
}

function jsMetronomeFunction() {
  log(t('log-metronome'));
  socket.emit('action', 'metronome');
  flashButton('posture-standing-btn');
}

function postureStanding() {
  log(t('log-standing'));
  socket.emit('action', 'standing');
  flashButton('posture-standing-btn');
}

function postureJumper() {
  log(t('log-jumper'));
  socket.emit('action', 'jumper');
  flashButton('posture-jumper-btn');
}

function postureKicker() {
  log(t('log-kicker'));
  socket.emit('action', 'kicker');
  flashButton('posture-kicker-btn');
}

function tap() {
  log(t('log-tap'));
  socket.emit('action', 'tap');
  flashButton('tap-btn');
}

function ondulation() {
  log(t('log-ondulation'));
  socket.emit('action', 'ondulation');
  flashButton('ondulation-btn');
}

function spinJump() {
  if (canJump()) {
    log(t('log-spin-jump'));
    socket.emit('action', 'spinjump');
    flashButton('spinjump-btn');
  }
}

function spinToPosture() {
  log(t('log-spin-to-posture'));
  socket.emit('action', 'spintoposture');
  flashButton('spintoposture-btn');
}

function spiral() {
  log(t('log-spiral'));
  socket.emit('action', 'spiral');
  flashButton('spiral-btn');
}

function slalom() {
  log(t('log-slalom'));
  socket.emit('action', 'slalom');
  flashButton('slalom-btn');
}

/// MOVE with keyboard
document.onkeydown = function (e) {
  switch (e.keyCode) {
    case 69: // E key - Spin Jump avec vérification
      if (canJump()) {
        socket.emit('action', 'spinjump');
        log(t('log-spin-jump-keyboard'));
        flashButton('spinjump-btn');
      }
      break;
    case 16: // Shift key
      socket.emit('action', 'tap');
      log(t('log-tap-keyboard'));
      flashButton('tap-btn');
      break;
    case 27: // Escape key
      socket.emit('action', 'stop');
      log(t('log-stop-keyboard'));
      break;
    case 32: // Space key - Jump avec vérification
      if (canJump()) {
        socket.emit('action', 'jump');
        log(t('log-jump-keyboard'));
        flashButton('jump-btn');
      }
      break;
    case 37: // Left arrow
      socket.emit('keydown', 'left');
      animateButton('left-btn', true);
      break;
    case 38: // Up arrow
      socket.emit('keydown', 'forward');
      animateButton('up-btn', true);
      break;
    case 39: // Right arrow
      socket.emit('keydown', 'right');
      animateButton('right-btn', true);
      break;
    case 40: // Down arrow
      socket.emit('keydown', 'backward');
      animateButton('down-btn', true);
      break;
  }
};

document.onkeyup = function (e) {
  switch (e.keyCode) {
    case 37: // Left arrow
      socket.emit('keyup', 'left');
      animateButton('left-btn', false);
      break;
    case 38: // Up arrow
      socket.emit('keyup', 'forward');
      animateButton('up-btn', false);
      break;
    case 39: // Right arrow
      socket.emit('keyup', 'right');
      animateButton('right-btn', false);
      break;
    case 40: // Down arrow
      socket.emit('keyup', 'backward');
      animateButton('down-btn', false);
      break;
  }
};

// Ajouter les styles pour les animations d'alerte et des boutons
var style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from {
      transform: translateX(400px);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
  
  @keyframes slideOut {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(400px);
      opacity: 0;
    }
  }
  
  /* Animation pour les boutons directionnels actifs (maintenue) */
  .btn-active {
    background-color: #337ab7 !important;
    border-color: #2e6da4 !important;
    color: white !important;
    transform: scale(1.1);
    box-shadow: 0 0 15px rgba(51, 122, 183, 0.6);
    transition: all 0.15s ease;
  }
  
  /* Animation flash pour les boutons d'action (temporaire) */
  .btn-flash {
    background-color: #5cb85c !important;
    border-color: #4cae4c !important;
    color: white !important;
    transform: scale(1.15);
    box-shadow: 0 0 20px rgba(92, 184, 92, 0.8);
    transition: all 0.1s ease;
  }
  
  /* Animation au survol */
  #up-btn, #down-btn, #left-btn, #right-btn {
    transition: all 0.15s ease;
  }
  
  #up-btn:hover, #down-btn:hover, #left-btn:hover, #right-btn:hover {
    transform: scale(1.05);
  }
  
  /* Transition douce pour tous les boutons */
  .btn {
    transition: all 0.15s ease;
  }
`;
document.head.appendChild(style);

// Fonctions pour le modal d'aide
function toggleHelpModal() {
  var modal = document.getElementById('help-modal');
  if (modal.style.display === 'flex') {
    modal.style.display = 'none';
  } else {
    modal.style.display = 'flex';
  }
}

function closeHelpModal(event) {
  if (event.target.id === 'help-modal') {
    toggleHelpModal();
  }
}

// ============================================
// SYSTÈME DE TRADUCTION
// ============================================

var currentLanguage = 'en'; // Anglais par défaut

var translations = {
  en: {
    // Boutons UI
    'help': 'Help',
    'btn-default': 'Default',
    'btn-metronome': 'Metronome',
    'btn-pusher': 'Pusher',
    'btn-push': 'Push',
    
    // Modal
    'modal-title': '🎮 Controls Guide',
    'gamepad-section': '🎮 Gamepad',
    'keyboard-section': '⌨️ Keyboard',
    'info-section': 'ℹ️ Information',
    'left-stick': 'Left Stick (↑↓)',
    'left-stick-desc': 'Move Forward / Backward',
    'right-stick': 'Right Stick (←→)',
    'right-stick-desc': 'Turn Left / Right',
    'posture-jumper': '🤸 Posture Jumper',
    'high-jump': '⏫ High Jump',
    'long-jump': '⏭ Long Jump',
    'posture-standing': '🧍 Standing',
    'spin-jump': '🤘 Spin Jump',
    'spin-to-posture': '🔄 Spin to Posture',
    'kick-jump': '🦘 KICK Jump',
    'posture-kicker': '🦵 Kicker',
    'movements': 'Movements',
    'space-key': 'Space',
    'jump': '⤴️ Jump',
    'escape-key': 'Escape',
    'stop': '⏹️ Stop',
    'battery-10': '🔋 <strong>Battery &lt; 10%</strong>: Light vibration',
    'battery-5': '🪫 <strong>Battery &lt; 5%</strong>: Strong continuous vibration',
    'battery-15': '⚠️ <strong>Battery &lt; 15%</strong>: Jumps disabled',
    'visual-animations': '✨ <strong>Visual animations</strong>: All buttons react',
    
    // Messages log
    'log-forward': '⬆️ Moving forward',
    'log-backward': '⬇️ Moving backward',
    'log-left': '⬅️ Moving left',
    'log-right': '➡️ Moving right',
    'log-tap': '👆 Tap',
    'log-spin': '🤪 Spin',
    'log-slowshake': '🧐 Slow Shake',
    'log-jumper': '🤸 Jumper',
    'log-high-jump': '⏫️ High Jump',
    'log-ondulation': '🌊 Ondulation',
    'log-long-jump': '⏭ Long Jump',
    'log-standing': '🧍 Standing',
    'log-spin-jump': '🤘😎🤚 Spin Jump',
    'log-spin-to-posture': '🔄 Spin to Posture',
    'log-kick-jump': '🦘 KICK Jump',
    'log-kicker': '🦵 Kicker',
    'log-spiral': '🌀 Spiral',
    'log-slalom': '⛷️ Slalom',
    'log-metronome': '😤 Metronome',
    'log-stop': '⏹',
    'log-jump-not-ready': '❌ Jump not ready - Wait for loading...',
    'log-motor-error': '❌ Motor error - Jump impossible!',
    'log-battery-low': '⚠️ Battery too low to jump!',
    'log-battery-critical': '🪫 ⚠️ CRITICAL BATTERY! Controller vibrates.',
    'log-battery-low-warning': '🔋 ⚠️ Low battery',
    'log-battery-ok': '🔋 ✅ Battery OK',
    'log-gamepad-connected': '🎮 Gamepad connected:',
    'log-gamepad-disconnected': '❌ Gamepad disconnected',
    'log-jump-keyboard': '⤴️ Jump (keyboard)',
    'log-spin-jump-keyboard': '🤘😎🤚 Spin Jump (keyboard)',
    'log-tap-keyboard': '👆 Tap (keyboard)',
    'log-stop-keyboard': '⏹️ Stop (keyboard)'
  },
  fr: {
    // Boutons UI
    'help': 'Aide',
    'btn-default': 'Par Défaut',
    'btn-metronome': 'Métronome',
    'btn-pusher': 'Pousseur',
    'btn-push': 'Poussée',
    
    // Modal
    'modal-title': '🎮 Guide des Contrôles',
    'gamepad-section': '🎮 Manette (Gamepad)',
    'keyboard-section': '⌨️ Clavier',
    'info-section': 'ℹ️ Informations',
    'left-stick': 'Stick Gauche (↑↓)',
    'left-stick-desc': 'Avancer / Reculer',
    'right-stick': 'Stick Droit (←→)',
    'right-stick-desc': 'Tourner gauche / droite',
    'posture-jumper': '🤸 Posture Sauteur',
    'high-jump': '⏫ Saut Haut',
    'long-jump': '⏭ Saut Long',
    'posture-standing': '🧍 Debout',
    'spin-jump': '🤘 Saut Tournant',
    'spin-to-posture': '🔄 Rotation vers Posture',
    'kick-jump': '🦘 Saut KICK',
    'posture-kicker': '🦵 Pousseur',
    'movements': 'Déplacements',
    'space-key': 'Espace',
    'jump': '⤴️ Saut',
    'escape-key': 'Echap',
    'stop': '⏹️ Stop',
    'battery-10': '🔋 <strong>Batterie &lt; 10%</strong> : Vibration légère',
    'battery-5': '🪫 <strong>Batterie &lt; 5%</strong> : Vibration forte continue',
    'battery-15': '⚠️ <strong>Batterie &lt; 15%</strong> : Sauts désactivés',
    'visual-animations': '✨ <strong>Animations visuelles</strong> : Tous les boutons réagissent',
    
    // Messages log
    'log-forward': '⬆️ Avancer',
    'log-backward': '⬇️ Reculer',
    'log-left': '⬅️ Tourner à gauche',
    'log-right': '➡️ Tourner à droite',
    'log-tap': '👆 Tap',
    'log-spin': '🤪 Rotation',
    'log-slowshake': '🧐 Secousse Lente',
    'log-jumper': '🤸 Posture Sauteur',
    'log-high-jump': '⏫️ Saut Haut',
    'log-ondulation': '🌊 Ondulation',
    'log-long-jump': '⏭ Saut Long',
    'log-standing': '🧍 Debout',
    'log-spin-jump': '🤘😎🤚 Saut Tournant',
    'log-spin-to-posture': '🔄 Rotation vers Posture',
    'log-kick-jump': '🦘 Saut KICK',
    'log-kicker': '🦵 Pousseur',
    'log-spiral': '🌀 Spirale',
    'log-slalom': '⛷️ Slalom',
    'log-metronome': '😤 Métronome',
    'log-stop': '⏹',
    'log-jump-not-ready': '❌ Saut pas prêt - Attends le chargement...',
    'log-motor-error': '❌ Moteur en erreur - Saut impossible!',
    'log-battery-low': '⚠️ Batterie trop faible pour sauter!',
    'log-battery-critical': '🪫 ⚠️ BATTERIE CRITIQUE! La manette vibre.',
    'log-battery-low-warning': '🔋 ⚠️ Batterie faible',
    'log-battery-ok': '🔋 ✅ Batterie OK',
    'log-gamepad-connected': '🎮 Manette connectée:',
    'log-gamepad-disconnected': '❌ Manette déconnectée',
    'log-jump-keyboard': '⤴️ Saut (clavier)',
    'log-spin-jump-keyboard': '🤘😎🤚 Saut Tournant (clavier)',
    'log-tap-keyboard': '👆 Tap (clavier)',
    'log-stop-keyboard': '⏹️ Stop (clavier)'
  }
};

// ============================================
// SYSTÈME DE TRADUCTION
// ============================================

var currentLanguage = 'en'; // Anglais par défaut

// Setup du radio switch pour la langue
function setupLanguageSwitch() {
  var langEN = document.getElementById('lang-en');
  var langFR = document.getElementById('lang-fr');
  
  if (langEN) {
    langEN.addEventListener('change', function() {
      if (this.checked) {
        currentLanguage = 'en';
        applyTranslations();
        console.log('🌍 Language changed: English');
      }
    });
  }
  
  if (langFR) {
    langFR.addEventListener('change', function() {
      if (this.checked) {
        currentLanguage = 'fr';
        applyTranslations();
        console.log('🌍 Langue changée: Français');
      }
    });
  }
}

// Fonction helper pour traduire un message
function t(key) {
  return translations[currentLanguage][key] || key;
}

function applyTranslations() {
  var elements = document.querySelectorAll('[data-translate]');
  
  elements.forEach(function(element) {
    var key = element.getAttribute('data-translate');
    if (translations[currentLanguage][key]) {
      // Si c'est un span dans un li, on utilise innerHTML pour garder le HTML
      if (element.tagName === 'SPAN' && element.parentElement.tagName === 'LI') {
        element.innerHTML = translations[currentLanguage][key];
      } else {
        element.textContent = translations[currentLanguage][key];
      }
    }
  });
}

// Appliquer la langue par défaut au chargement
document.addEventListener('DOMContentLoaded', function() {
  setupLanguageSwitch();
  applyTranslations();
});