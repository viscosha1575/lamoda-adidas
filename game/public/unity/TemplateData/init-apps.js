(function() {
    const urlParams = new URLSearchParams(window.location.search);

    const isVK = urlParams.has('vk_app_id') || urlParams.has('api_settings');
    // Более надежная проверка TG для Mini Apps
    const isTG = window.location.hash.includes('tgWebAppData') || !!window.Telegram?.WebApp?.initData;

    // VK
    if (isVK) {
        // Ждем, если скрипт еще не подгрузился
        const initVK = () => {
            if (typeof vkBridge !== 'undefined') {
                vkBridge.send('VKWebAppInit').then(data => console.log('VK Init Success', data)).catch(err => console.error('VK Init Error', err));
            }
        };
        initVK();
    }

    // Telegram
    if (isTG) {
      if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
          window.Telegram.WebApp.ready();
          window.Telegram.WebApp.expand();
          if (window.Telegram.WebApp.requestFullscreen) {
              window.Telegram.WebApp.requestFullscreen();
          }
      }
    }
})();
