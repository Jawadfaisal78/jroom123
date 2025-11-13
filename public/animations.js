
// Animation utilities for enhanced UI interactions
class AnimationManager {
  static fadeIn(element, duration = 300) {
    element.style.opacity = '0';
    element.style.transform = 'translateY(20px)';
    element.style.transition = `opacity ${duration}ms ease, transform ${duration}ms ease`;
    
    setTimeout(() => {
      element.style.opacity = '1';
      element.style.transform = 'translateY(0)';
    }, 10);
  }
  
  static fadeOut(element, duration = 300) {
    element.style.transition = `opacity ${duration}ms ease, transform ${duration}ms ease`;
    element.style.opacity = '0';
    element.style.transform = 'translateY(-20px)';
    
    return new Promise(resolve => {
      setTimeout(resolve, duration);
    });
  }
  
  static slideIn(element, direction = 'right', duration = 400) {
    const transforms = {
      right: 'translateX(100%)',
      left: 'translateX(-100%)',
      up: 'translateY(-100%)',
      down: 'translateY(100%)'
    };
    
    element.style.transform = transforms[direction];
    element.style.transition = `transform ${duration}ms cubic-bezier(0.4, 0, 0.2, 1)`;
    
    setTimeout(() => {
      element.style.transform = 'translateX(0) translateY(0)';
    }, 10);
  }
  
  static slideOut(element, direction = 'right', duration = 400) {
    const transforms = {
      right: 'translateX(100%)',
      left: 'translateX(-100%)',
      up: 'translateY(-100%)',
      down: 'translateY(100%)'
    };
    
    element.style.transition = `transform ${duration}ms cubic-bezier(0.4, 0, 0.2, 1)`;
    element.style.transform = transforms[direction];
    
    return new Promise(resolve => {
      setTimeout(resolve, duration);
    });
  }
  
  static bounce(element, scale = 1.1, duration = 200) {
    element.style.transition = `transform ${duration}ms cubic-bezier(0.68, -0.55, 0.265, 1.55)`;
    element.style.transform = `scale(${scale})`;
    
    setTimeout(() => {
      element.style.transform = 'scale(1)';
    }, duration);
  }
  
  static ripple(element, event) {
    const rect = element.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = event.clientX - rect.left - size / 2;
    const y = event.clientY - rect.top - size / 2;
    
    const ripple = document.createElement('span');
    ripple.style.cssText = `
      position: absolute;
      width: ${size}px;
      height: ${size}px;
      left: ${x}px;
      top: ${y}px;
      background: rgba(255, 255, 255, 0.3);
      border-radius: 50%;
      transform: scale(0);
      animation: ripple-animation 600ms linear;
      pointer-events: none;
      z-index: 1000;
    `;
    
    element.appendChild(ripple);
    
    setTimeout(() => {
      ripple.remove();
    }, 600);
  }
  
  static staggeredFadeIn(elements, delay = 100, duration = 300) {
    elements.forEach((element, index) => {
      element.style.opacity = '0';
      element.style.transform = 'translateY(30px)';
      element.style.transition = `opacity ${duration}ms ease, transform ${duration}ms ease`;
      
      setTimeout(() => {
        element.style.opacity = '1';
        element.style.transform = 'translateY(0)';
      }, index * delay);
    });
  }
  
  static shake(element, intensity = 10, duration = 500) {
    const keyframes = [
      { transform: 'translateX(0)' },
      { transform: `translateX(-${intensity}px)` },
      { transform: `translateX(${intensity}px)` },
      { transform: `translateX(-${intensity * 0.8}px)` },
      { transform: `translateX(${intensity * 0.8}px)` },
      { transform: `translateX(-${intensity * 0.6}px)` },
      { transform: `translateX(${intensity * 0.6}px)` },
      { transform: 'translateX(0)' }
    ];
    
    element.animate(keyframes, {
      duration: duration,
      easing: 'ease-in-out'
    });
  }
  
  static pulse(element, scale = 1.05, duration = 1000) {
    const keyframes = [
      { transform: 'scale(1)' },
      { transform: `scale(${scale})` },
      { transform: 'scale(1)' }
    ];
    
    return element.animate(keyframes, {
      duration: duration,
      easing: 'ease-in-out',
      iterations: Infinity
    });
  }
}

// CSS Animation keyframes to be injected
const animationCSS = `
  @keyframes ripple-animation {
    to {
      transform: scale(4);
      opacity: 0;
    }
  }
  
  @keyframes float {
    0%, 100% { transform: translateY(0px); }
    50% { transform: translateY(-10px); }
  }
  
  @keyframes glow {
    0%, 100% { box-shadow: 0 0 5px rgba(0, 168, 132, 0.5); }
    50% { box-shadow: 0 0 20px rgba(0, 168, 132, 0.8); }
  }
  
  .float-animation {
    animation: float 3s ease-in-out infinite;
  }
  
  .glow-animation {
    animation: glow 2s ease-in-out infinite;
  }
`;

// Inject animation CSS
const style = document.createElement('style');
style.textContent = animationCSS;
document.head.appendChild(style);

// Export for use in other files
window.AnimationManager = AnimationManager;
