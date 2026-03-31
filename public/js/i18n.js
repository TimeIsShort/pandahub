// PandaHub i18n Core
(function() {
  var currentLang = localStorage.getItem('lang') || 'zh';
  var translations = {};
  var baseUrl = '/i18n/';

  // Load language file
  function loadLang(lang) {
    return fetch(baseUrl + lang + '.json')
      .then(function(res) { return res.json(); })
      .then(function(data) {
        translations = data;
        currentLang = lang;
        localStorage.setItem('lang', lang);
        return translations;
      });
  }

  // Get translation
  function t(key) {
    if (translations[key] !== undefined) {
      return translations[key];
    }
    // Fallback to Chinese if key not found
    if (currentLang === 'en') {
      return key; // Return key itself if translation missing
    }
    return key;
  }

  // Switch language
  function switchLang(lang) {
    if (lang === currentLang) return Promise.resolve();
    return loadLang(lang).then(function() {
      applyTranslations();
      document.dispatchEvent(new CustomEvent('langChanged', { detail: { lang: lang } }));
    });
  }

  // Apply translations to elements with data-i18n attribute
  function applyTranslations() {
    var els = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var key = el.getAttribute('data-i18n');
      var translated = t(key);
      if (el.tagName === 'INPUT' && el.getAttribute('placeholder')) {
        el.setAttribute('placeholder', translated);
      } else if (el.getAttribute('data-i18n-attr')) {
        el.setAttribute(el.getAttribute('data-i18n-attr'), translated);
      } else {
        el.textContent = translated;
      }
    }

    // Update language toggle button text
    var toggle = document.getElementById('lang-toggle-btn');
    if (toggle) {
      toggle.textContent = currentLang === 'zh' ? 'EN' : '中文';
      toggle.title = currentLang === 'zh' ? 'Switch to English' : '切换到中文';
    }
  }

  // Expose globally
  window.i18n = {
    t: t,
    switchLang: switchLang,
    getLang: function() { return currentLang; },
    loadLang: loadLang,
    applyTranslations: applyTranslations
  };

  // Auto-load saved language
  if (currentLang === 'en') {
    loadLang('en').then(applyTranslations);
  }

})();
