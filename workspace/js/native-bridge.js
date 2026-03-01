/**
 * Native Bridge — Capacitor integration for Mission Control
 *
 * When running inside the Capacitor iOS shell, this enables:
 *   - Push notifications (agent task completion alerts)
 *   - App lifecycle management (reliable WS reconnect on foreground)
 *   - Status bar styling (dark theme)
 *   - Native storage fallback (more reliable than localStorage)
 *
 * When running in a regular browser, everything is a no-op.
 * The bridge uses window.Capacitor.Plugins (injected by the native shell)
 * so no npm imports are needed on the web side.
 */
(function () {
  'use strict';

  function isNative() {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  }

  window.NativeBridge = {
    isNative: isNative,
    pushToken: null,
    _initialized: false,

    // ------------------------------------------------------------------
    // Init — called automatically on DOMContentLoaded
    // ------------------------------------------------------------------
    async init() {
      if (this._initialized) return;
      this._initialized = true;

      if (!isNative()) {
        console.log('[NativeBridge] Browser mode — native features disabled');
        return;
      }

      console.log('[NativeBridge] Capacitor detected — initializing native features');
      this._initLifecycle();
      this._initStatusBar();
      // Push init is async and non-blocking — errors are caught internally
      this._initPush().catch(function (err) {
        console.warn('[NativeBridge] Push init failed:', err.message);
      });
    },

    // ------------------------------------------------------------------
    // App Lifecycle — foreground/background handling
    // ------------------------------------------------------------------
    // More reliable than visibilitychange on iOS. When the app returns
    // to foreground after being suspended (not just tab-switched), this
    // fires and triggers a WS reconnect if needed.
    // ------------------------------------------------------------------
    _initLifecycle() {
      var self = this;
      var App = this._plugin('App');
      if (!App) return;

      App.addListener('appStateChange', function (state) {
        console.log('[NativeBridge] App ' + (state.isActive ? 'foregrounded' : 'backgrounded'));

        if (state.isActive) {
          // Give the network stack a moment to re-establish after wake
          setTimeout(function () {
            try {
              var appStore = window.Alpine && Alpine.store('app');
              if (appStore && !appStore.ocConnected) {
                console.log('[NativeBridge] Reconnecting WS after foreground...');
                appStore.reconnect();
              }
            } catch (e) { /* Alpine not ready yet */ }
          }, 500);
        }
      });

      // URL open handler — deep links (future: open specific agent/workflow)
      App.addListener('appUrlOpen', function (data) {
        console.log('[NativeBridge] URL open:', data.url);
      });
    },

    // ------------------------------------------------------------------
    // Push Notifications
    // ------------------------------------------------------------------
    // Registers with APNs and listens for incoming notifications.
    // The device token is sent to the server so OpenClaw can send pushes
    // when agents complete tasks.
    // ------------------------------------------------------------------
    async _initPush() {
      var self = this;
      var Push = this._plugin('PushNotifications');
      if (!Push) {
        console.warn('[NativeBridge] PushNotifications plugin not installed');
        return;
      }

      // Request permission
      var perm = await Push.requestPermissions();
      if (perm.receive !== 'granted') {
        console.warn('[NativeBridge] Push permission denied by user');
        return;
      }

      // Register with APNs
      await Push.register();

      // Token received — store and send to server
      Push.addListener('registration', function (token) {
        console.log('[NativeBridge] APNs token received');
        self.pushToken = token.value;
        self._sendTokenToServer(token.value);
      });

      // Registration failed
      Push.addListener('registrationError', function (err) {
        console.error('[NativeBridge] Push registration error:', err.error);
      });

      // Push received while app is open — show in Monitor
      Push.addListener('pushNotificationReceived', function (notification) {
        console.log('[NativeBridge] Push received:', notification.title);
        try {
          var monitor = window.Alpine && Alpine.store('monitor');
          if (monitor) {
            monitor.addLog('info', 'Push: ' + (notification.title || notification.body || 'notification'));
          }
        } catch (e) { /* Alpine not ready */ }
      });

      // Push tapped — app opened from notification
      Push.addListener('pushNotificationActionPerformed', function (action) {
        console.log('[NativeBridge] Push tapped:', action.notification.data);
        // Future: navigate to specific view based on notification data
        // e.g., action.notification.data.view = 'chat', data.sessionId = '...'
        try {
          var appStore = window.Alpine && Alpine.store('app');
          var data = action.notification && action.notification.data;
          if (appStore && data && data.view) {
            appStore.setView(data.view);
          }
        } catch (e) { /* Alpine not ready */ }
      });
    },

    // ------------------------------------------------------------------
    // Status Bar — match the dark Mission Control theme
    // ------------------------------------------------------------------
    _initStatusBar() {
      var StatusBar = this._plugin('StatusBar');
      if (!StatusBar) return;

      try {
        StatusBar.setStyle({ style: 'DARK' });
        StatusBar.setBackgroundColor({ color: '#0a0e17' });
      } catch (e) {
        console.warn('[NativeBridge] StatusBar styling failed:', e.message);
      }
    },

    // ------------------------------------------------------------------
    // Native Storage — more reliable than localStorage on iOS
    // ------------------------------------------------------------------
    // Wraps @capacitor/preferences. Falls back to localStorage in browser.
    // ------------------------------------------------------------------
    async getItem(key) {
      var Preferences = this._plugin('Preferences');
      if (Preferences) {
        var result = await Preferences.get({ key: key });
        return result.value;
      }
      return localStorage.getItem(key);
    },

    async setItem(key, value) {
      var Preferences = this._plugin('Preferences');
      if (Preferences) {
        await Preferences.set({ key: key, value: value });
        return;
      }
      localStorage.setItem(key, value);
    },

    async removeItem(key) {
      var Preferences = this._plugin('Preferences');
      if (Preferences) {
        await Preferences.remove({ key: key });
        return;
      }
      localStorage.removeItem(key);
    },

    // ------------------------------------------------------------------
    // Internals
    // ------------------------------------------------------------------
    _plugin(name) {
      try {
        return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins[name];
      } catch (e) {
        return null;
      }
    },

    _sendTokenToServer(token) {
      // POST device token for push notification delivery.
      // If the endpoint doesn't exist yet, store locally for later.
      fetch('/api/mc/push/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token, platform: 'ios', timestamp: new Date().toISOString() })
      }).then(function (res) {
        if (res.ok) console.log('[NativeBridge] Token registered with server');
        else console.warn('[NativeBridge] Token registration returned ' + res.status);
      }).catch(function () {
        console.warn('[NativeBridge] Token registration endpoint not available — stored locally');
        try { localStorage.setItem('mc_push_token', token); } catch (e) { /* */ }
      });
    }
  };

  // Auto-init on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { window.NativeBridge.init(); });
  } else {
    window.NativeBridge.init();
  }
})();
