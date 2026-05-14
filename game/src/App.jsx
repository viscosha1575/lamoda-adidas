import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  checkSubscriptionStatus,
  deleteCurrentPlayer,
  resetAnonymousId,
} from './api.js'
import { logGameDebug } from './debug.js'
import { getTelegramWebApp, requestTelegramFullscreen } from './telegram.js'
import { useBackendBootstrap, useServerGameSession } from './game-session.js'

const defaultChannelUrl = import.meta.env.VITE_SUBSCRIPTION_CHANNEL_URL ?? 'https://t.me/lamoda_na_svyazi'
const LOADING_SCREEN = 'loading'
const MAP_TUTORIAL_SCREEN = 'map-tutorial'
const GAME_PLAY_SCREEN = 'game-play'
const TOTAL_SNEAKER_COUNT = 10
const MOBILE_CANVAS_WIDTH = 390
const MOBILE_CANVAS_HEIGHT = 844
const MAP_IMAGE_WIDTH = 786
const MAP_IMAGE_HEIGHT = 1704
const TUTORIAL_MAP_OVERSCAN_X = 1.12
const TUTORIAL_MAP_TOP_CROP_RATIO = 0.1
const GAME_MAP_SCALE = MOBILE_CANVAS_WIDTH / MAP_IMAGE_WIDTH
const GAME_MAP_OVERSCAN_X = 2.5
const GAME_MAP_MAX_PINCH_ZOOM = 2
const MOBILE_INTERACTIVE_SNEAKER_SCALE = 1.08
const GAME_START_SCROLL_X = 35
const GAME_START_SCROLL_Y = 670
const TUTORIAL_START_SCROLL_Y = 560
const TG_SAFE_CONTENT_TOP = 'var(--tg-content-safe-area-inset-top, env(safe-area-inset-top, 0px))'
const TG_SAFE_CONTENT_BOTTOM = 'var(--tg-content-safe-area-inset-bottom, env(safe-area-inset-bottom, 0px))'
const TG_SAFE_CONTENT_LEFT = 'var(--tg-content-safe-area-inset-left, env(safe-area-inset-left, 0px))'
const TG_SAFE_CONTENT_RIGHT = 'var(--tg-content-safe-area-inset-right, env(safe-area-inset-right, 0px))'
const TG_SAFE_UI_TOP = 'max(var(--tg-safe-area-inset-top, env(safe-area-inset-top, 0px)), var(--tg-content-safe-area-inset-top, env(safe-area-inset-top, 0px)))'
const TG_SAFE_INTRO_TOP = `calc(${TG_SAFE_UI_TOP} + 1rem)`
let phaserSceneDebugId = 0
const tutorialSneakerObject = {
  key: 'tutorial-sneaker-10',
  texturePath: '/assets/game/sneakers/sneakers10-3.webp',
  x: 286.18,
  y: 645.82,
  width: 92,
  rotation: -8,
  interactive: true,
  glowTextureKey: 'tutorial-sneaker-10-glow',
  glowTexturePath: '/assets/game/glow.webp',
  glowWidth: 153.4,
  glowHeight: 132.6,
  glowOffsetX: 6,
  glowOffsetY: 18,
  glowAlpha: 0.88,
}
const tutorialHandObject = {
  key: 'tutorial-hand',
  texturePath: '/assets/hand.webp',
  x: 522.72,
  y: 790.61,
  width: 110,
  rotation: 138,
}
const tutorialSceneObjects = [tutorialSneakerObject, tutorialHandObject]
const tutorialFoundCopy = {
  title: 'Отличное\nначало!',
  body: [
    'Первая пара ваша.',
    'Осталось 9 пар и ровно',
    '10 минут на их поиск.',
    '',
    'Найдите все и участвуйте',
    'в розыгрыше 10 сертификатов',
    'Lamoda на 10 000 рублей.',
  ],
}
const friendsScreenCopy = {
  title: 'Расследование\nзаходит в тупик?',
  kicker: 'Пригласите напарника!',
  body: [
    'Поделитесь игрой с другом,',
    'получите промокод на Lamoda',
    'и три подсказки, которые',
    'помогут найти кроссовки.',
  ],
}

function readSafeInsetPx(cssVarName) {
  if (typeof window === 'undefined') {
    return 0
  }

  const rawValue = window.getComputedStyle(document.documentElement).getPropertyValue(cssVarName)
  const parsedValue = Number.parseFloat(rawValue)

  return Number.isFinite(parsedValue) ? parsedValue : 0
}
const gamePropObjects = [
  {
    key: 'prop-basketball-1-x1830-y4429',
    texturePath: '/assets/game/props/basketball-1-x1830-y4429.webp',
    x: 1830,
    y: 4429,
    loopBounce: {
      travelY: 22,
      duration: 650,
      hold: 80,
    },
  },
  { key: 'prop-building-part-x1448-y0', texturePath: '/assets/game/props/building-part-x1448-y0.webp', x: 1448, y: 0, depth: 12 },
  {
    key: 'prop-car-x37-y1095',
    texturePath: '/assets/game/props/car-x37-y1095.webp',
    x: 37,
    y: 1095,
    loopTranslate: {
      travelX: -240,
      travelY: 146,
      duration: 2400,
      hold: 950,
    },
  },
  { key: 'game-sneaker-2', texturePath: '/assets/game/sneakers%20new/sneakers2.webp', x: 250, y: 6160, width: 72, scale: 0.8, interactive: true, sneakerNumber: 2 },
  { key: 'game-sneaker-3', texturePath: '/assets/game/sneakers%20new/sneakers3.webp', x: 0, y: 5520, width: 72, scale: 0.6, interactive: true, sneakerNumber: 3 },
  { key: 'game-sneaker-4', texturePath: '/assets/game/sneakers%20new/sneakers4.webp', x: 380, y: 4190, width: 72, scale: 0.6, interactive: true, sneakerNumber: 4 },
  { key: 'game-sneaker-5', texturePath: '/assets/game/sneakers%20new/sneakers5.webp', x: 1540, y: 2270, width: 72, scale: 0.6, interactive: true, sneakerNumber: 5 },
  { key: 'game-sneaker-6', texturePath: '/assets/game/sneakers%20new/sneakers6.webp', x: 1135, y: 1428, width: 72, scale: 0.6, interactive: true, sneakerNumber: 6 },
  { key: 'game-sneaker-7', texturePath: '/assets/game/sneakers%20new/sneakers7.webp', x: 300, y: 1720, width: 72, scale: 0.7, interactive: true, sneakerNumber: 7 },
  { key: 'game-sneaker-8', texturePath: '/assets/game/sneakers%20new/sneakers8.webp', x: 1960, y: 465, width: 72, scale: 0.8, interactive: true, sneakerNumber: 8 },
  { key: 'game-sneaker-9', texturePath: '/assets/game/sneakers%20new/sneakers9.webp', x: 555, y: 3310, width: 72, scale: 0.6, interactive: true, sneakerNumber: 9 },
  { key: 'game-sneaker-10', texturePath: '/assets/game/sneakers%20new/sneakers10.webp', x: 1710, y: 5475, width: 72, scale: 0.55, interactive: true, sneakerNumber: 10 },
  {
    key: 'prop-disco-lights-1-x1248-y193',
    texturePath: '/assets/game/props/disco-lights-1-x1248-y193.webp',
    x: 1248,
    y: 193,
    alphaCycle: {
      mode: 'crossfade',
      partnerKey: 'prop-disco-lights-2-x1248-y193',
      duration: 1200,
      hold: 180,
      from: 1,
      to: 0,
    },
  },
  {
    key: 'prop-disco-lights-2-x1248-y193',
    texturePath: '/assets/game/props/disco-lights-2-x1248-y193.webp',
    x: 1248,
    y: 193,
    alphaCycle: {
      mode: 'crossfade',
      partnerKey: 'prop-disco-lights-1-x1248-y193',
      duration: 1200,
      hold: 180,
      from: 0,
      to: 1,
    },
  },
  {
    key: 'prop-fountain-glint-1-x1528-y2318',
    texturePath: '/assets/game/props/fountain-glint-1-x1528-y2318.webp',
    x: 1528,
    y: 2318,
    frameSequence: {
      groupKey: 'fountain-glints',
      frameIndex: 0,
      stepDuration: 240,
      fade: true,
      dimAlpha: 0.14,
    },
  },
  {
    key: 'prop-fountain-glint-2-x1593-y2289',
    texturePath: '/assets/game/props/fountain-glint-2-x1593-y2289.webp',
    x: 1593,
    y: 2289,
    frameSequence: {
      groupKey: 'fountain-glints',
      frameIndex: 1,
      stepDuration: 240,
      fade: true,
      dimAlpha: 0.14,
    },
  },
  {
    key: 'prop-fountain-glint-3-x1576-y2333',
    texturePath: '/assets/game/props/fountain-glint-3-x1576-y2333.webp',
    x: 1576,
    y: 2333,
    frameSequence: {
      groupKey: 'fountain-glints',
      frameIndex: 2,
      stepDuration: 240,
      fade: true,
      dimAlpha: 0.14,
    },
  },
  {
    key: 'prop-fountain-sprite-1-x1867-y2901',
    texturePath: '/assets/game/props/fountain-sprite-1-x1867-y2901.webp',
    x: 1867,
    y: 2901,
    frameSequence: {
      groupKey: 'fountain-sprite-main',
      frameIndex: 0,
      stepDuration: 180,
    },
  },
  {
    key: 'prop-fountain-sprite-2-x1870-y2902',
    texturePath: '/assets/game/props/fountain-sprite-2-x1870-y2902.webp',
    x: 1870,
    y: 2902,
    frameSequence: {
      groupKey: 'fountain-sprite-main',
      frameIndex: 1,
      stepDuration: 180,
    },
  },
  {
    key: 'prop-fountain-sprite-3-x1874-y2901',
    texturePath: '/assets/game/props/fountain-sprite-3-x1874-y2901.webp',
    x: 1874,
    y: 2901,
    frameSequence: {
      groupKey: 'fountain-sprite-main',
      frameIndex: 2,
      stepDuration: 180,
    },
  },
  { key: 'prop-guy-by-garage-x1461-y417', texturePath: '/assets/game/props/guy-by-garage-x1461-y417.webp', x: 1461, y: 417, depth: 20 },
  {
    key: 'prop-handstand-guy-x1669-y1717',
    texturePath: '/assets/game/props/handstand-guy-x1669-y1717.webp',
    x: 1669,
    y: 1717,
    loopBalance: {
      angle: 4.2,
      travelX: 7,
      duration: 1900,
      delay: 120,
    },
  },
  {
    key: 'prop-hearts-x1745-y2017',
    texturePath: '/assets/game/props/hearts-x1745-y2017.webp',
    x: 1745,
    y: 2017,
    loopPulse: {
      from: 0.9,
      to: 1.08,
      duration: 1500,
      delay: 120,
    },
  },
  {
    key: 'prop-lake-glints-1-x4-y2110',
    texturePath: '/assets/game/props/lake-glints-1-x4-y2110.webp',
    x: 4,
    y: 2110,
    frameSequence: {
      groupKey: 'lake-glints',
      frameIndex: 0,
      stepDuration: 260,
      fade: true,
      dimAlpha: 0.12,
    },
  },
  {
    key: 'prop-lake-glints-2-x5-y2133',
    texturePath: '/assets/game/props/lake-glints-2-x5-y2133.webp',
    x: 5,
    y: 2133,
    frameSequence: {
      groupKey: 'lake-glints',
      frameIndex: 1,
      stepDuration: 260,
      fade: true,
      dimAlpha: 0.12,
    },
  },
  {
    key: 'prop-lake-glints-3-x7-y2151',
    texturePath: '/assets/game/props/lake-glints-3-x7-y2151.webp',
    x: 7,
    y: 2151,
    frameSequence: {
      groupKey: 'lake-glints',
      frameIndex: 2,
      stepDuration: 260,
      fade: true,
      dimAlpha: 0.12,
    },
  },
  {
    key: 'prop-lake-lanterns-x41-y6120',
    texturePath: '/assets/game/props/lake-lanterns-x41-y6120.webp',
    x: 41,
    y: 6120,
    offsetY: 1060,
    anchorY: 'bottom',
    loopBlink: {
      from: 1,
      to: 0.72,
      duration: 420,
      hold: 260,
      delay: 140,
    },
  },
  {
    key: 'prop-leg-1-x1020-y5306',
    texturePath: '/assets/game/props/leg-1-x1020-y5306.webp',
    x: 1020,
    y: 5306,
    loopSwing: {
      pivotX: 0.14,
      pivotY: 0.14,
      fromAngle: -2.5,
      toAngle: 4.5,
      duration: 540,
      delay: 0,
    },
  },
  {
    key: 'prop-leg-2-x1111-y5265',
    texturePath: '/assets/game/props/leg-2-x1111-y5265.webp',
    x: 1111,
    y: 5265,
    loopSwing: {
      pivotX: 0.86,
      pivotY: 0.14,
      fromAngle: 2.5,
      toAngle: -4.5,
      duration: 540,
      delay: 0,
    },
  },
  { key: 'prop-petal-x121-y5473', texturePath: '/assets/game/props/petal-x121-y5473.webp', x: 121, y: 5473 },
  { key: 'prop-petal-x148-y5490', texturePath: '/assets/game/props/petal-x148-y5490.webp', x: 148, y: 5490 },
  { key: 'prop-petal-x18-y5499', texturePath: '/assets/game/props/petal-x18-y5499.webp', x: 18, y: 5499 },
  { key: 'prop-petal-x48-y5561', texturePath: '/assets/game/props/petal-x48-y5561.webp', x: 48, y: 5561 },
  { key: 'prop-petal-x66-y5468', texturePath: '/assets/game/props/petal-x66-y5468.webp', x: 66, y: 5468 },
  { key: 'prop-petal-x95-y5531', texturePath: '/assets/game/props/petal-x95-y5531.webp', x: 95, y: 5531 },
  {
    key: 'prop-roller-shutter-x1452-y280',
    texturePath: '/assets/game/props/roller-shutter-x1452-y280.webp',
    x: 1452,
    y: 280,
    depth: 8,
    loopMotion: {
      travelY: -124,
      duration: 1500,
      hold: 700,
    },
  },
  {
    key: 'prop-rooftop-door-1-x1829-y169',
    texturePath: '/assets/game/props/rooftop-door-1-x1829-y169.webp',
    x: 1829,
    y: 169,
    depth: -1,
    loopScaleX: {
      anchor: 'right',
      from: 1,
      to: 0.08,
      duration: 1500,
      hold: 700,
    },
  },
  {
    key: 'prop-rooftop-door-3-x1794-y160',
    texturePath: '/assets/game/props/rooftop-door-3-x1794-y160.webp',
    x: 1794,
    y: 160,
    depth: -2,
  },
  {
    key: 'prop-skateboarder-x515-y1714',
    texturePath: '/assets/game/props/skateboarder-x515-y1714.webp',
    x: 515,
    y: 1714,
    loopTranslate: {
      travelX: 124,
      travelY: -56,
      duration: 2100,
      hold: 260,
    },
  },
  {
    key: 'prop-soccer-ball-x1098-y5254',
    texturePath: '/assets/game/props/soccer-ball-x1098-y5254.webp',
    x: 1098,
    y: 5254,
    loopBounce: {
      travelY: -30,
      duration: 540,
      returnDuration: 540,
      hold: 0,
      ease: 'Sine.easeInOut',
      returnEase: 'Sine.easeInOut',
    },
  },
  {
    key: 'prop-soccer-x1803-y1736',
    texturePath: '/assets/game/props/soccer-x1803-y1736.webp',
    x: 1803,
    y: 1736,
    loopBounce: {
      travelY: 18,
      duration: 620,
      hold: 70,
    },
  },
  {
    key: 'prop-store-lights-x234-y2021',
    texturePath: '/assets/game/props/store-lights-x234-y2021.webp',
    x: 234,
    y: 2021,
    loopBlink: {
      from: 1,
      to: 0.3,
      duration: 280,
      hold: 130,
      delay: 90,
    },
  },
  {
    key: 'prop-store-sign-2-x1045-y1621',
    texturePath: '/assets/game/props/store-sign-2-x1045-y1621.webp',
    x: 1045,
    y: 1621,
    loopBlink: {
      from: 1,
      to: 0.42,
      duration: 260,
      hold: 110,
      delay: 0,
    },
  },
  {
    key: 'prop-store-sign-x481-y2085',
    texturePath: '/assets/game/props/store-sign-x481-y2085.webp',
    x: 481,
    y: 2085,
    loopBlink: {
      from: 1,
      to: 0.36,
      duration: 320,
      hold: 150,
      delay: 180,
    },
  },
  {
    key: 'prop-water-lilies-1-x1106-y5684',
    texturePath: '/assets/game/props/water-lilies-1-x1106-y5684.webp',
    x: 1106,
    y: 5684,
    loopSwayX: {
      travelX: 16,
      duration: 3200,
      hold: 0,
      delay: 0,
      ease: 'Sine.easeInOut',
      returnEase: 'Sine.easeInOut',
    },
  },
  {
    key: 'prop-water-lilies-1-x604-y6563',
    texturePath: '/assets/game/props/water-lilies-1-x604-y6563.webp',
    x: 604,
    y: 6563,
    loopSwayX: {
      travelX: -18,
      duration: 3400,
      hold: 0,
      delay: 280,
      ease: 'Sine.easeInOut',
      returnEase: 'Sine.easeInOut',
    },
  },
  {
    key: 'prop-water-lilies-2-x607-y6781',
    texturePath: '/assets/game/props/water-lilies-2-x607-y6781.webp',
    x: 607,
    y: 6781,
    loopSwayX: {
      travelX: 14,
      duration: 3000,
      hold: 0,
      delay: 520,
      ease: 'Sine.easeInOut',
      returnEase: 'Sine.easeInOut',
    },
  },
]

const tutorialBackdropSceneObjects = [
  ...gamePropObjects.filter((object) => !object.key.startsWith('game-sneaker-')),
  {
    key: 'tutorial-map-sneaker-1',
    texturePath: '/assets/game/sneakers%20new/sneakers1.webp',
    x: 300,
    y: 1716,
    width: 72,
    scale: 0.8,
    depth: 3,
    interactive: true,
    clickAction: 'tutorialZoom',
  },
]
const seamlessMapSceneObjects = [
  ...tutorialBackdropSceneObjects,
  ...gamePropObjects.filter((object) => object.key.startsWith('game-sneaker-')),
]

function getMapObjectSceneMode(object) {
  if (object.clickAction === 'tutorialZoom') {
    return 'tutorial'
  }

  if (object.key.startsWith('game-sneaker-')) {
    return 'gameplay'
  }

  return 'shared'
}

const PRELOAD_ASSET_URLS = Array.from(new Set([
  '/assets/back-loading.webp',
  '/assets/founder.webp',
  '/assets/lamoda.webp',
  '/assets/sneakers.webp',
  '/assets/hand.webp',
  '/assets/map-full.webp',
  '/assets/game/friends.webp',
  '/assets/game/glow.webp',
  '/assets/game/svg/start-button-green.svg',
  '/assets/game/svg/end-button-green.svg',
  '/assets/svg/start-button.svg',
  '/assets/svg/end-button.svg',
  '/assets/game/ui/about.webp',
  '/assets/game/ui/friends.webp',
  '/assets/game/ui/money.webp',
  '/assets/game/ui/panel.webp',
  '/assets/game/ui/popup.webp',
  '/assets/game/ui/sneakers.webp',
  '/assets/game/ui/text-popup.webp',
  '/assets/game/ui/time.webp',
  '/assets/game/ui/sneakers-ui/arrow-back.svg',
  '/assets/game/ui/sneakers-ui/hidden-card-small.webp',
  '/assets/game/ui/sneakers-ui/open-card-big.webp',
  '/assets/game/ui/sneakers-ui/open-card-small.webp',
  '/assets/game/ui/sneakers-ui/poster-text.svg',
  '/assets/game/ui/sneakers-ui/save.svg',
  '/assets/game/ui/sneakers-ui/sneakers-back.svg',
  '/assets/game/ui/sneakers-ui/target.svg',
  ...seamlessMapSceneObjects.map((object) => object.texturePath),
  '/font/VCROSDMONO[NOLIVANTNTEDIT]-REGULAR.TTF',
]))

function preloadAssetUrl(url) {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve()
      return
    }

    if (url.endsWith('.ttf') || url.endsWith('.woff2')) {
      fetch(url, { cache: 'force-cache' })
        .catch(() => null)
        .finally(resolve)
      return
    }

    const image = new Image()
    image.decoding = 'async'
    image.loading = 'eager'
    image.onload = () => resolve()
    image.onerror = () => resolve()
    image.src = url

    if (image.complete) {
      resolve()
    }
  })
}

function formatRemainingSeconds(totalSeconds) {
  const safeSeconds = Math.max(0, Number(totalSeconds || 0))
  const minutes = Math.floor(safeSeconds / 60)
  const seconds = safeSeconds % 60

  return {
    minutes: String(minutes).padStart(2, '0'),
    seconds: String(seconds).padStart(2, '0'),
  }
}

function SneakerArt() {
  return (
    <div className="intro-art-entrance flex h-[12.5rem] w-[17rem] max-w-full items-center justify-center overflow-hidden">
      <img
        src="/assets/sneakers.webp"
        alt="Кроссовок Adidas"
        className="h-[15.25rem] w-auto max-w-none"
      />
    </div>
  )
}

function LamodaArt() {
  return (
    <div className="intro-art-entrance relative w-[18rem] max-w-full">
      <span
        aria-hidden="true"
        className="lamoda-glow-loop pointer-events-none absolute left-1/2 top-[68%] z-0 h-[34px] w-[228px] -translate-x-1/2 -translate-y-1/2 rounded-[228px] bg-white opacity-[0.78] blur-[37px]"
      />
      <img
        src="/assets/lamoda.webp"
        alt="Логотип Lamoda"
        className="relative z-10 h-auto w-full max-w-full drop-shadow-[0_20px_28px_rgba(8,12,20,0.22)]"
      />
    </div>
  )
}

function SearchArt() {
  return (
    <div className="search-art-tilt intro-art-entrance relative w-[15rem] max-w-full">
      <img
        src="/assets/founder.webp"
        alt="Иллюстрация проверки подписки"
        className="h-auto w-full"
      />
    </div>
  )
}

function HiddenMapWarmupImage() {
  return (
    <img
      src="/assets/map-full.webp"
      alt=""
      aria-hidden="true"
      fetchPriority="high"
      decoding="async"
      loading="eager"
      className="pointer-events-none fixed left-0 top-0 h-px w-px opacity-0"
    />
  )
}

function LoadingScreen({ progress }) {
  return (
    <main className="fixed inset-0 z-[120] min-h-svh overflow-hidden bg-black text-white">
      <section className="relative flex min-h-svh items-center justify-center overflow-hidden">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[url('/assets/back-loading.webp')] bg-cover bg-center"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,8,8,0.28)_0%,rgba(10,10,10,0.06)_34%,rgba(6,6,6,0.28)_68%,rgba(0,0,0,0.82)_100%)]"
        />

        <div className="relative z-10 flex min-h-svh w-full max-w-[390px] flex-col items-center px-8 pt-[15vh] pb-[9vh]">
          <h1 className="loading-title text-center font-display leading-none text-white">
            <span className="loading-title-top block whitespace-nowrap">В ПОИСКАХ</span>
            <span className="loading-title-bottom block">СТИЛЯ</span>
          </h1>

          <div className="mt-auto flex w-full flex-col items-center gap-4">
            <div className="loading-progress-frame w-full max-w-[30rem] border-[3px] border-black bg-[#f0e8d6] p-[4px]">
              <div className="h-[18px] w-full overflow-hidden bg-[#f0e8d6]">
                <div
                  className="loading-progress-fill h-full bg-[linear-gradient(180deg,#97d96f_0%,#73b74d_58%,#5a9739_100%)] transition-[width] duration-200 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            <p className="loading-caption text-center font-display text-[clamp(1.4rem,6vw,2rem)] leading-none text-white">
              Уже почти...
            </p>
          </div>
        </div>
      </section>
    </main>
  )
}

function BootstrapScreen({ message = 'Подключаем игру...' }) {
  return (
    <main className="fixed inset-0 z-[160] flex min-h-svh items-center justify-center bg-black px-6 text-white">
      <div className="w-full max-w-[24rem] text-center">
        <div className="font-display text-[clamp(2rem,9vw,3.4rem)] leading-[0.92]">
          ПОДКЛЮЧАЕМ
          <br />
          ИГРУ
        </div>
        <p className="mt-6 text-[clamp(1rem,4.4vw,1.35rem)] leading-[1.05] text-white/90">
          {message}
        </p>
      </div>
    </main>
  )
}

function SessionResultOverlay({
  title,
  body,
  actionLabel,
  onAction,
}) {
  return (
    <div
      className="absolute inset-0 z-[80] flex items-center justify-center bg-black/72"
      style={{
        paddingTop: TG_SAFE_CONTENT_TOP,
        paddingRight: `calc(${TG_SAFE_CONTENT_RIGHT} + 1rem)`,
        paddingBottom: TG_SAFE_CONTENT_BOTTOM,
        paddingLeft: `calc(${TG_SAFE_CONTENT_LEFT} + 1rem)`,
      }}
    >
      <div className="w-full max-w-[23rem] text-center">
        <div className="rounded-[20px] border-2 border-[#d9fcab] bg-[rgba(8,8,8,0.92)] px-6 py-8 shadow-[0_20px_40px_rgba(0,0,0,0.4)]">
          <h2 className="font-display text-[clamp(1.9rem,8vw,3rem)] leading-[0.92] text-white">
            {title}
          </h2>
          <p className="mt-5 text-[clamp(1rem,4.4vw,1.25rem)] leading-[1.06] text-white/92">
            {body}
          </p>
          <div className="mt-7 flex justify-center">
            <RibbonButton label={actionLabel} onClick={onAction} />
          </div>
        </div>
      </div>
    </div>
  )
}

function DebugPanel({
  player,
  isDeleting = false,
  errorMessage = '',
  onDeletePlayer,
  onClose,
}) {
  return (
    <div
      className="pointer-events-auto absolute inset-0 z-[90] flex items-center justify-center bg-black/72"
      style={{
        paddingTop: TG_SAFE_CONTENT_TOP,
        paddingRight: `calc(${TG_SAFE_CONTENT_RIGHT} + 1rem)`,
        paddingBottom: TG_SAFE_CONTENT_BOTTOM,
        paddingLeft: `calc(${TG_SAFE_CONTENT_LEFT} + 1rem)`,
      }}
    >
      <div className="pointer-events-auto w-full max-w-[22rem] rounded-[20px] border-2 border-[#d9fcab] bg-[rgba(8,8,8,0.94)] px-5 py-6 shadow-[0_20px_40px_rgba(0,0,0,0.4)]">
        <h2 className="font-display text-[clamp(1.7rem,7vw,2.4rem)] leading-[0.92] text-white">
          DEBUG PANEL
        </h2>

        <div className="mt-5 space-y-2 font-display text-[14px] leading-[1.05] text-white/88">
          <p>ID: {player?.id ?? 'unknown'}</p>
          <p>Provider: {player?.authProvider ?? 'unknown'}</p>
          <p className="break-all">Anonymous ID: {player?.anonymousId ?? 'none'}</p>
          <p className="break-all">Telegram ID: {player?.telegramUserId ?? 'none'}</p>
        </div>

        {errorMessage ? (
          <p className="mt-4 font-display text-[14px] leading-[1.05] text-[#ffb4b4]">
            {errorMessage}
          </p>
        ) : null}

        <div className="mt-6 flex flex-col items-center gap-3">
          <RibbonButton
            label={isDeleting ? 'Удаляем...' : 'Удалить юзера'}
            onClick={onDeletePlayer}
            className={isDeleting ? 'opacity-60' : ''}
          />
          <RibbonButton
            label="Закрыть"
            onClick={onClose}
            startRibbonSrc="/assets/svg/start-button.svg"
            endRibbonSrc="/assets/svg/end-button.svg"
          />
        </div>
      </div>
    </div>
  )
}

function ButtonSvg({ width = '189', className = '' }) {
  return (
    <svg
      width={width}
      height="48"
      viewBox="0 0 189 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="none"
      className={className}
      aria-hidden="true"
    >
      <mask id="button-shape-mask" fill="white">
        <path d="M182.539 2.74512H185.619V5.74805H188.81V2.74512H188.811V44.0967H188.81V41.0938H185.619V44.0967H182.539V47.2871H6.27246V44.0967H3.19238V41.0938H0.000976562V44.0967H0V3.19043H0.000976562V6.19336H3.19141V3.19043H6.27148V0H182.539V2.74512Z" />
      </mask>
      <path d="M182.539 2.74512H185.619V5.74805H188.81V2.74512H188.811V44.0967H188.81V41.0938H185.619V44.0967H182.539V47.2871H6.27246V44.0967H3.19238V41.0938H0.000976562V44.0967H0V3.19043H0.000976562V6.19336H3.19141V3.19043H6.27148V0H182.539V2.74512Z" fill="black" />
      <path
        d="M182.539 2.74512H181.539V3.74512H182.539V2.74512ZM185.619 2.74512H186.619V1.74512H185.619V2.74512ZM185.619 5.74805H184.619V6.74805H185.619V5.74805ZM188.81 5.74805V6.74805H189.81V5.74805H188.81ZM188.81 2.74512V1.74512H187.81V2.74512H188.81ZM188.811 2.74512H189.811V1.74512H188.811V2.74512ZM188.811 44.0967V45.0967H189.811V44.0967H188.811ZM188.81 44.0967H187.81V45.0967H188.81V44.0967ZM188.81 41.0938H189.81V40.0938H188.81V41.0938ZM185.619 41.0938V40.0938H184.619V41.0938H185.619ZM185.619 44.0967V45.0967H186.619V44.0967H185.619ZM182.539 44.0967V43.0967H181.539V44.0967H182.539ZM182.539 47.2871V48.2871H183.539V47.2871H182.539ZM6.27246 47.2871H5.27246V48.2871H6.27246V47.2871ZM6.27246 44.0967H7.27246V43.0967H6.27246V44.0967ZM3.19238 44.0967H2.19238V45.0967H3.19238V44.0967ZM3.19238 41.0938H4.19238V40.0938H3.19238V41.0938ZM0.000976562 41.0938V40.0938H-0.999023V41.0938H0.000976562ZM0.000976562 44.0967V45.0967H1.00098V44.0967H0.000976562ZM0 44.0967H-1V45.0967H0V44.0967ZM0 3.19043V2.19043H-1V3.19043H0ZM0.000976562 3.19043H1.00098V2.19043H0.000976562V3.19043ZM0.000976562 6.19336H-0.999023V7.19336H0.000976562V6.19336ZM3.19141 6.19336V7.19336H4.19141V6.19336H3.19141ZM3.19141 3.19043V2.19043H2.19141V3.19043H3.19141ZM6.27148 3.19043V4.19043H7.27148V3.19043H6.27148ZM6.27148 0V-1H5.27148V0H6.27148ZM182.539 0H183.539V-1H182.539V0ZM182.539 2.74512V3.74512H185.619V2.74512V1.74512H182.539V2.74512ZM185.619 2.74512H184.619V5.74805H185.619H186.619V2.74512H185.619ZM185.619 5.74805V6.74805H188.81V5.74805V4.74805H185.619V5.74805ZM188.81 5.74805H189.81V2.74512H188.81H187.81V5.74805H188.81ZM188.81 2.74512V3.74512H188.811V2.74512V1.74512H188.81V2.74512ZM188.811 2.74512H187.811V44.0967H188.811H189.811V2.74512H188.811ZM188.811 44.0967V43.0967H188.81V44.0967V45.0967H188.811V44.0967ZM188.81 44.0967H189.81V41.0938H188.81H187.81V44.0967H188.81ZM188.81 41.0938V40.0938H185.619V41.0938V42.0938H188.81V41.0938ZM185.619 41.0938H184.619V44.0967H185.619H186.619V41.0938H185.619ZM185.619 44.0967V43.0967H182.539V44.0967V45.0967H185.619V44.0967ZM182.539 44.0967H181.539V47.2871H182.539H183.539V44.0967H182.539ZM182.539 47.2871V46.2871H6.27246V47.2871V48.2871H182.539V47.2871ZM6.27246 47.2871H7.27246V44.0967H6.27246H5.27246V47.2871H6.27246ZM6.27246 44.0967V43.0967H3.19238V44.0967V45.0967H6.27246V44.0967ZM3.19238 44.0967H4.19238V41.0938H3.19238H2.19238V44.0967H3.19238ZM3.19238 41.0938V40.0938H0.000976562V41.0938V42.0938H3.19238V41.0938ZM0.000976562 41.0938H-0.999023V44.0967H0.000976562H1.00098V41.0938H0.000976562ZM0.000976562 44.0967V43.0967H0V44.0967V45.0967H0.000976562V44.0967ZM0 44.0967H1V3.19043H0H-1V44.0967H0ZM0 3.19043V4.19043H0.000976562V3.19043V2.19043H0V3.19043ZM0.000976562 3.19043H-0.999023V6.19336H0.000976562H1.00098V3.19043H0.000976562ZM0.000976562 6.19336V7.19336H3.19141V6.19336V5.19336H0.000976562V6.19336ZM3.19141 6.19336H4.19141V3.19043H3.19141H2.19141V6.19336H3.19141ZM3.19141 3.19043V4.19043H6.27148V3.19043V2.19043H3.19141V3.19043ZM6.27148 3.19043H7.27148V0H6.27148H5.27148V3.19043H6.27148ZM6.27148 0V1H182.539V0V-1H6.27148V0ZM182.539 0H181.539V2.74512H182.539H183.539V0H182.539Z"
        fill="black"
        mask="url(#button-shape-mask)"
      />
    </svg>
  )
}

function ButtonSvgLight({ width = '349', className = '' }) {
  return (
    <svg
      width={width}
      height="48"
      viewBox="0 0 349 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="none"
      className={className}
      aria-hidden="true"
    >
      <mask id="button-light-shape-mask" fill="white">
        <path d="M342.538 2.74512H345.618V5.74805H348.81V2.74512H348.811V44.0967H348.81V41.0938H345.618V44.0967H342.538V47.2871H6.27246V44.0967H3.19238V41.0938H0.000976562V44.0967H0V3.19043H0.000976562V6.19336H3.19238V3.19043H6.27246V0H342.538V2.74512Z" />
      </mask>
      <path d="M342.538 2.74512H345.618V5.74805H348.81V2.74512H348.811V44.0967H348.81V41.0938H345.618V44.0967H342.538V47.2871H6.27246V44.0967H3.19238V41.0938H0.000976562V44.0967H0V3.19043H0.000976562V6.19336H3.19238V3.19043H6.27246V0H342.538V2.74512Z" fill="#D9FCAB" />
      <path
        d="M342.538 2.74512H339.538V5.74512H342.538V2.74512ZM345.618 2.74512H348.618V-0.254883H345.618V2.74512ZM345.618 5.74805H342.618V8.74805H345.618V5.74805ZM348.81 5.74805V8.74805H351.81V5.74805H348.81ZM348.81 2.74512V-0.254883H345.81V2.74512H348.81ZM348.811 2.74512H351.811V-0.254883H348.811V2.74512ZM348.811 44.0967V47.0967H351.811V44.0967H348.811ZM348.81 44.0967H345.81V47.0967H348.81V44.0967ZM348.81 41.0938H351.81V38.0938H348.81V41.0938ZM345.618 41.0938V38.0938H342.618V41.0938H345.618ZM345.618 44.0967V47.0967H348.618V44.0967H345.618ZM342.538 44.0967V41.0967H339.538V44.0967H342.538ZM342.538 47.2871V50.2871H345.538V47.2871H342.538ZM6.27246 47.2871H3.27246V50.2871H6.27246V47.2871ZM6.27246 44.0967H9.27246V41.0967H6.27246V44.0967ZM3.19238 44.0967H0.192383V47.0967H3.19238V44.0967ZM3.19238 41.0938H6.19238V38.0938H3.19238V41.0938ZM0.000976562 41.0938V38.0938H-2.99902V41.0938H0.000976562ZM0.000976562 44.0967V47.0967H3.00098V44.0967H0.000976562ZM0 44.0967H-3V47.0967H0V44.0967ZM0 3.19043V0.19043H-3V3.19043H0ZM0.000976562 3.19043H3.00098V0.19043H0.000976562V3.19043ZM0.000976562 6.19336H-2.99902V9.19336H0.000976562V6.19336ZM3.19238 6.19336V9.19336H6.19238V6.19336H3.19238ZM3.19238 3.19043V0.19043H0.192383V3.19043H3.19238ZM6.27246 3.19043V6.19043H9.27246V3.19043H6.27246ZM6.27246 0V-3H3.27246V0H6.27246ZM342.538 0H345.538V-3H342.538V0ZM342.538 2.74512V5.74512H345.618V2.74512V-0.254883H342.538V2.74512ZM345.618 2.74512H342.618V5.74805H345.618H348.618V2.74512H345.618ZM345.618 5.74805V8.74805H348.81V5.74805V2.74805H345.618V5.74805ZM348.81 5.74805H351.81V2.74512H348.81H345.81V5.74805H348.81ZM348.81 2.74512V5.74512H348.811V2.74512V-0.254883H348.81V2.74512ZM348.811 2.74512H345.811V44.0967H348.811H351.811V2.74512H348.811ZM348.811 44.0967V41.0967H348.81V44.0967V47.0967H348.811V44.0967ZM348.81 44.0967H351.81V41.0938H348.81H345.81V44.0967H348.81ZM348.81 41.0938V38.0938H345.618V41.0938V44.0938H348.81V41.0938ZM345.618 41.0938H342.618V44.0967H345.618H348.618V41.0938H345.618ZM345.618 44.0967V41.0967H342.538V44.0967V47.0967H345.618V44.0967ZM342.538 44.0967H339.538V47.2871H342.538H345.538V44.0967H342.538ZM342.538 47.2871V44.2871H6.27246V47.2871V50.2871H342.538V47.2871ZM6.27246 47.2871H9.27246V44.0967H6.27246H3.27246V47.2871H6.27246ZM6.27246 44.0967V41.0967H3.19238V44.0967V47.0967H6.27246V44.0967ZM3.19238 44.0967H6.19238V41.0938H3.19238H0.192383V44.0967H3.19238ZM3.19238 41.0938V38.0938H0.000976562V41.0938V44.0938H3.19238V41.0938ZM0.000976562 41.0938H-2.99902V44.0967H0.000976562H3.00098V41.0938H0.000976562ZM0.000976562 44.0967V41.0967H0V44.0967V47.0967H0.000976562V44.0967ZM0 44.0967H3V3.19043H0H-3V44.0967H0ZM0 3.19043V6.19043H0.000976562V3.19043V0.19043H0V3.19043ZM0.000976562 3.19043H-2.99902V6.19336H0.000976562H3.00098V3.19043H0.000976562ZM0.000976562 6.19336V9.19336H3.19238V6.19336V3.19336H0.000976562V6.19336ZM3.19238 6.19336H6.19238V3.19043H3.19238H0.192383V6.19336H3.19238ZM3.19238 3.19043V6.19043H6.27246V3.19043V0.19043H3.19238V3.19043ZM6.27246 3.19043H9.27246V0H6.27246H3.27246V3.19043H6.27246ZM6.27246 0V3H342.538V0V-3H6.27246V0ZM342.538 0H339.538V2.74512H342.538H345.538V0H342.538Z"
        fill="black"
        mask="url(#button-light-shape-mask)"
      />
    </svg>
  )
}

function RibbonButton({
  label,
  onClick,
  className = '',
  width = '188.811',
  startRibbonSrc = '/assets/game/svg/start-button-green.svg',
  endRibbonSrc = '/assets/game/svg/end-button-green.svg',
}) {
  return (
    <button
      type="button"
      className={`pixel-button-intro ${className}`.trim()}
      onClick={onClick}
    >
      <ButtonSvg
        width={width}
        className="absolute inset-0 h-full w-full"
      />
      <span
        aria-hidden="true"
        className="start-ribbon-bob pointer-events-none absolute -bottom-[6px] -left-8 z-[-1] block h-[1.128rem] w-[2.375rem]"
      >
        <span className="ribbon-reveal-inner block h-full w-full overflow-hidden">
          <img
            src={startRibbonSrc}
            alt=""
            className="h-auto w-[2.375rem] max-w-none"
          />
        </span>
      </span>
      <span
        aria-hidden="true"
        className="end-ribbon-wiggle pointer-events-none absolute -right-12 top-[calc(-1rem+1px)] z-20 block h-[2.4375rem] w-[6.85rem]"
      >
        <span className="ribbon-reveal-inner block h-full w-full overflow-hidden">
          <img
            src={endRibbonSrc}
            alt=""
            className="h-auto w-[6.85rem] max-w-none"
          />
        </span>
      </span>
      <span className="button-text-dark relative z-10">
        {label}
      </span>
    </button>
  )
}

function PhaserMapCanvas({
  texturePath,
  sceneObjects = [],
  hintConfig = null,
  onSneakerFound = null,
  onSneakerStart = null,
  getSneakerTargetRect = null,
}) {
  const containerRef = useRef(null)
  const onSneakerFoundRef = useRef(onSneakerFound)
  const onSneakerStartRef = useRef(onSneakerStart)
  const getSneakerTargetRectRef = useRef(getSneakerTargetRect)

  useEffect(() => {
    onSneakerFoundRef.current = onSneakerFound
  }, [onSneakerFound])

  useEffect(() => {
    onSneakerStartRef.current = onSneakerStart
  }, [onSneakerStart])

  useEffect(() => {
    getSneakerTargetRectRef.current = getSneakerTargetRect
  }, [getSneakerTargetRect])

  useEffect(() => {
    const container = containerRef.current

    if (!container) {
      return undefined
    }

    let cancelled = false
    let game = null
    let resizeHandler = null

    const init = async () => {
      const PhaserModule = await import('phaser')
      const Phaser = PhaserModule.default

      if (document.fonts?.load) {
        await document.fonts.load('16px "VCR OSD Mono [NolivantNT Edit]"')
      }

      if (cancelled) {
        return
      }

      class MapTutorialScene extends Phaser.Scene {
        preload() {
          this.load.image('tutorial-bg', texturePath)

          sceneObjects.forEach((object) => {
            if (object.type !== 'text') {
              this.load.image(object.key, object.texturePath)

              if (object.glowTextureKey && object.glowTexturePath) {
                this.load.image(object.glowTextureKey, object.glowTexturePath)
              }
            }
          })
        }

        create() {
          const mapTexture = this.textures.get('tutorial-bg').getSourceImage()
          const map = this.add.image(0, 0, 'tutorial-bg').setOrigin(0.5, 0)
          const renderObjects = sceneObjects.map((object) => {
            if (object.type === 'text') {
              const text = this.add.text(0, 0, object.text, {
                fontFamily: '"VCR OSD Mono [NolivantNT Edit]", monospace',
                fontSize: `${object.fontSize}px`,
                color: object.color,
                align: object.align,
              })
              text.setOrigin(0.5, 0)
              text.setResolution(2)

              return { object, text }
            }

            const glow = object.glowTextureKey
              ? this.add
                  .image(0, 0, object.glowTextureKey)
                  .setOrigin(0, 0)
                  .setAlpha(object.glowAlpha ?? 1)
                  .setBlendMode(Phaser.BlendModes.ADD)
              : null

            const glowSoft = null
            const glowCore = null

            const sprite = this.add.image(0, 0, object.key).setOrigin(0, 0)

            if (object.interactive) {
              sprite.setInteractive({ useHandCursor: true })
            }

            return { object, glowSoft, glow, glowCore, sprite }
          })

          if (hintConfig) {
            this.createHints = () => {
              this.hints = hintConfig.texts
              this.hintLayoutConfig = hintConfig
              const initialText = this.hints?.[hintConfig.initialKey] ?? ''
              const cam = this.cameras.main
              const width = cam.width
              const height = cam.height

              this.hintBg = this.add
                .rectangle(
                  width * hintConfig.xFactor,
                  height * hintConfig.yFactor,
                  0,
                  0,
                  hintConfig.backgroundColor,
                  hintConfig.backgroundAlpha,
                )
                .setOrigin(0.5)
                .setScrollFactor(0)
                .setDepth(1000)
                .setVisible(false)

              this.hintText = this.add
                .text(width / 2, height * hintConfig.yFactor, initialText, {
                  fontFamily: '"VCR OSD Mono [NolivantNT Edit]", monospace',
                  fontSize: `${hintConfig.fontSize}px`,
                  color: hintConfig.color,
                  align: hintConfig.align,
                  wordWrap: {
                    width: width * hintConfig.widthFactor,
                  },
                })
                .setOrigin(0.5)
                .setScrollFactor(0)
                .setDepth(1001)
                .setVisible(false)
                .setResolution(2)

              this.positionHint()
              this.scale.on('resize', () => {
                this.positionHint()
              })
            }

            this.positionHint = () => {
              if (!this.hintText || !this.hintLayoutConfig) {
                return
              }

              const cam = this.cameras.main
              const width = cam.width
              const height = cam.height
              const wrapWidth = width * this.hintLayoutConfig.widthFactor

              this.hintText.setStyle({
                align: this.hintLayoutConfig.align,
                wordWrap: { width: wrapWidth, useAdvancedWrap: true },
              })
              this.hintText.setFontSize(this.hintLayoutConfig.fontSize)
              this.hintText.setLineSpacing(this.hintLayoutConfig.lineSpacing)
              this.hintText.setPosition(
                width * this.hintLayoutConfig.xFactor,
                height * this.hintLayoutConfig.yFactor,
              )
              this.hintText.setWordWrapWidth(wrapWidth, true)

              const bounds = this.hintText.getBounds()
              this.hintBg.setPosition(
                width * this.hintLayoutConfig.xFactor,
                height * this.hintLayoutConfig.yFactor,
              )
              this.hintBg.setSize(
                Math.ceil(bounds.width + this.hintLayoutConfig.paddingX * 2),
                Math.ceil(bounds.height + this.hintLayoutConfig.paddingY * 2),
              )
            }

            this.showHint = (key, duration = 0) => {
              const nextText = this.hints?.[key]

              if (!nextText) {
                return
              }

              this.hintText.setText(nextText)
              this.positionHint()
              this.hintBg.setVisible(true)
              this.hintText.setVisible(true)

              if (this.hintTimer) {
                this.time.removeEvent(this.hintTimer)
              }

              if (duration > 0) {
                this.hintTimer = this.time.delayedCall(duration, () => {
                  this.hideHint()
                })
              }
            }

            this.hideHint = () => {
              this.hintBg?.setVisible(false)
              this.hintText?.setVisible(false)
            }

            this.createHints()
          }

          this.completeSneakerFind = () => {
            if (this.sneakerFound) {
              return
            }

            const sneakerRender = renderObjects.find(
              ({ object }) => object.key === tutorialSneakerObject.key,
            )
            const handRender = renderObjects.find(
              ({ object }) => object.key === tutorialHandObject.key,
            )

            if (!sneakerRender?.sprite) {
              return
            }

            this.sneakerFound = true
            sneakerRender.sprite.disableInteractive()
            this.hideHint?.()
            onSneakerStartRef.current?.()

            if (handRender?.sprite) {
              this.tweens.add({
                targets: handRender.sprite,
                alpha: 0,
                duration: 220,
                ease: 'Sine.easeOut',
              })
            }

            const zoomSprite = this.add
              .image(sneakerRender.sprite.x, sneakerRender.sprite.y, sneakerRender.object.key)
              .setOrigin(0, 0)
              .setDisplaySize(
                sneakerRender.sprite.displayWidth,
                sneakerRender.sprite.displayHeight,
              )
              .setAngle(sneakerRender.sprite.angle)
              .setDepth(950)

            const zoomGlow = sneakerRender.glow
              ? this.add
                  .image(sneakerRender.glow.x, sneakerRender.glow.y, sneakerRender.object.glowTextureKey)
                  .setOrigin(0, 0)
                  .setAlpha(sneakerRender.object.glowAlpha ?? 1)
                  .setBlendMode(Phaser.BlendModes.ADD)
                  .setDisplaySize(
                    sneakerRender.glow.displayWidth,
                    sneakerRender.glow.displayHeight,
                  )
                  .setDepth(940)
              : null

            this.tweens.add({
              targets: [sneakerRender.sprite, sneakerRender.glow].filter(Boolean),
              alpha: 0,
              duration: 120,
              ease: 'Sine.easeOut',
            })

            const canvasBounds = this.game.canvas.getBoundingClientRect()
            const targetRect = getSneakerTargetRectRef.current?.()
            const sourceWidth = zoomSprite.texture.source[0].width
            const sourceHeight = zoomSprite.texture.source[0].height

            let targetWidth = this.scale.width * 0.46
            let targetHeight = targetWidth * (sourceHeight / sourceWidth)
            let targetX = (this.scale.width - targetWidth) / 2
            let targetY = (this.scale.height - targetHeight) / 2

            if (targetRect) {
              const maxWidth = targetRect.width * 0.82
              const maxHeight = targetRect.height * 0.82
              const fitScale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight)

              targetWidth = sourceWidth * fitScale
              targetHeight = sourceHeight * fitScale
              targetX = targetRect.left - canvasBounds.left + ((targetRect.width - targetWidth) / 2)
              targetY = targetRect.top - canvasBounds.top + ((targetRect.height - targetHeight) / 2)
            }

            this.tweens.add({
              targets: zoomSprite,
              x: targetX,
              y: targetY,
              displayWidth: targetWidth,
              displayHeight: targetHeight,
              angle: -9,
              duration: 760,
              ease: 'Cubic.easeInOut',
              onUpdate: () => {
                if (!zoomGlow) {
                  return
                }

                const currentScale = zoomSprite.displayWidth / sneakerRender.object.width
                const currentGlowWidth = sneakerRender.object.glowWidth * currentScale
                const currentGlowHeight = sneakerRender.object.glowHeight * currentScale

                zoomGlow.setPosition(
                  zoomSprite.x
                    + ((zoomSprite.displayWidth - currentGlowWidth) / 2)
                    + ((sneakerRender.object.glowOffsetX ?? 0) * currentScale),
                  zoomSprite.y
                    + (((zoomSprite.displayWidth * 0.58 - currentGlowHeight) / 2)
                    + ((sneakerRender.object.glowOffsetY ?? 0) * currentScale)),
                )
                zoomGlow.setDisplaySize(currentGlowWidth, currentGlowHeight)
              },
              onComplete: () => {
                window.setTimeout(() => {
                  onSneakerFoundRef.current?.()
                }, 120)
              },
            })
          }

          const layout = (width, height) => {
            const worldWidth = width * TUTORIAL_MAP_OVERSCAN_X
            const mapScale = worldWidth / mapTexture.width
            const worldHeight = mapTexture.height * mapScale
            const mapOffsetX = (width - worldWidth) / 2
            const mapOffsetY = -Math.max(0, (worldHeight - height) * TUTORIAL_MAP_TOP_CROP_RATIO)

            map.setPosition(mapOffsetX + worldWidth / 2, mapOffsetY)
            map.setDisplaySize(worldWidth, worldHeight)

            renderObjects.forEach(({ object, glowSoft, glow, glowCore, sprite, text }) => {
              if (object.type === 'text') {
                if (!text) {
                  return
                }

                const wrapWidth = object.width * mapScale

                text.setStyle({
                  align: object.align,
                  wordWrap: { width: wrapWidth, useAdvancedWrap: true },
                })
                text.setPosition(
                  mapOffsetX + (object.x * mapScale),
                  mapOffsetY + (object.y * mapScale),
                )
                text.setFontSize(object.fontSize * mapScale)
                text.setLineSpacing(object.lineSpacing * mapScale)
                text.setWordWrapWidth(wrapWidth, true)
                return
              }

              const x = mapOffsetX + (object.x * mapScale)
              const y = mapOffsetY + (object.y * mapScale)
              const objectWidth = object.width * mapScale

              if (glow) {
                glow.setPosition(
                  x + (((object.width - object.glowWidth) / 2) + (object.glowOffsetX ?? 0)) * mapScale,
                  y + (((object.width * 0.58 - object.glowHeight) / 2) + (object.glowOffsetY ?? 0)) * mapScale,
                )
                glow.setDisplaySize(
                  object.glowWidth * mapScale,
                  object.glowHeight * mapScale,
                )
              }

              sprite.setPosition(x, y)
              sprite.setDisplaySize(
                objectWidth,
                objectWidth * (sprite.texture.source[0].height / sprite.texture.source[0].width),
              )
              sprite.setRotation((object.rotation * Math.PI) / 180)

              if (object.interactive) {
                sprite.off('pointerdown')
                sprite.on('pointerdown', () => {
                  this.completeSneakerFind()
                })
              }
            })
          }

          layout(this.scale.width, this.scale.height)
          this.scale.on('resize', (gameSize) => layout(gameSize.width, gameSize.height))
          this.showHint?.(hintConfig?.initialKey)
        }
      }

      const initialWidth = Math.max(container.clientWidth || 0, 320)
      const initialHeight = Math.max(container.clientHeight || 0, window.innerHeight || 568)

      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: container,
        width: initialWidth,
        height: initialHeight,
        backgroundColor: '#000000',
        render: {
          antialias: true,
          pixelArt: true,
          roundPixels: true,
        },
        scene: MapTutorialScene,
        scale: {
          mode: Phaser.Scale.RESIZE,
          autoCenter: Phaser.Scale.NO_CENTER,
          width: initialWidth,
          height: initialHeight,
        },
      })

      resizeHandler = () => {
        if (!game || !container) {
          return
        }

        const nextWidth = Math.max(container.clientWidth || 0, 320)
        const nextHeight = Math.max(container.clientHeight || 0, window.innerHeight || 568)
        game.scale.resize(nextWidth, nextHeight)
      }

      window.addEventListener('resize', resizeHandler)
    }

    init()

    return () => {
      cancelled = true
      if (resizeHandler) {
        window.removeEventListener('resize', resizeHandler)
      }
      game?.destroy(true)
    }
  }, [texturePath, sceneObjects, hintConfig])

  return <div ref={containerRef} className="phaser-map-canvas absolute inset-0" />
}

function FixedGameMapBackground({
  scrollX = GAME_START_SCROLL_X,
  scrollY = GAME_START_SCROLL_Y,
}) {
  const containerRef = useRef(null)
  const [viewport, setViewport] = useState({
    width: MOBILE_CANVAS_WIDTH,
    height: MOBILE_CANVAS_HEIGHT,
  })
  const [mapAssetSize, setMapAssetSize] = useState({
    width: MAP_IMAGE_WIDTH,
    height: MAP_IMAGE_HEIGHT,
  })

  useEffect(() => {
    const syncViewport = () => {
      const node = containerRef.current

      if (!node) {
        return
      }

      setViewport({
        width: Math.max(node.clientWidth || 0, 320),
        height: Math.max(node.clientHeight || 0, window.innerHeight || 568),
      })
    }

    syncViewport()
    window.addEventListener('resize', syncViewport)

    return () => {
      window.removeEventListener('resize', syncViewport)
    }
  }, [])

  const worldWidth = viewport.width * GAME_MAP_OVERSCAN_X
  const mapScale = worldWidth / mapAssetSize.width
  const worldHeight = mapAssetSize.height * mapScale

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden">
      <img
        src="/assets/map-full.webp"
        alt=""
        aria-hidden="true"
        className="absolute max-w-none"
        onLoad={(event) => {
          const { naturalWidth, naturalHeight } = event.currentTarget

          if (naturalWidth > 0 && naturalHeight > 0) {
            setMapAssetSize({
              width: naturalWidth,
              height: naturalHeight,
            })
          }
        }}
        style={{
          width: `${worldWidth}px`,
          height: `${worldHeight}px`,
          left: `${-scrollX}px`,
          top: `${-scrollY}px`,
          imageRendering: 'pixelated',
        }}
      />
    </div>
  )
}

function DraggableGameMapCanvas({
  texturePath,
  sceneObjects = [],
  onSneakerCollect = null,
  collectedSneakerNumbers = [],
  canCollect = true,
  interactionEnabled = null,
  onTutorialObjectStart = null,
  onTutorialObjectComplete = null,
  getTutorialObjectTargetRect = null,
  initialScrollX = GAME_START_SCROLL_X,
  initialScrollY = GAME_START_SCROLL_Y,
  disableDrag = false,
  sceneMode = 'gameplay',
  sceneApiRef = null,
  initialDimAlpha = 0,
  onReady = null,
  fadeOnReady = true,
  className = '',
}) {
  const debugIdRef = useRef(0)
  const containerRef = useRef(null)
  const localSceneApiRef = useRef(null)
  const effectiveSceneApiRef = sceneApiRef ?? localSceneApiRef
  const onSneakerCollectRef = useRef(onSneakerCollect)
  const onTutorialObjectStartRef = useRef(onTutorialObjectStart)
  const onTutorialObjectCompleteRef = useRef(onTutorialObjectComplete)
  const getTutorialObjectTargetRectRef = useRef(getTutorialObjectTargetRect)
  const collectedSneakerNumbersRef = useRef(collectedSneakerNumbers)
  const canCollectRef = useRef(canCollect)
  const interactionEnabledRef = useRef(interactionEnabled)
  const onReadyRef = useRef(onReady)

  useEffect(() => {
    onSneakerCollectRef.current = onSneakerCollect
  }, [onSneakerCollect])

  useEffect(() => {
    onTutorialObjectStartRef.current = onTutorialObjectStart
  }, [onTutorialObjectStart])

  useEffect(() => {
    onTutorialObjectCompleteRef.current = onTutorialObjectComplete
  }, [onTutorialObjectComplete])

  useEffect(() => {
    getTutorialObjectTargetRectRef.current = getTutorialObjectTargetRect
  }, [getTutorialObjectTargetRect])

  useEffect(() => {
    onReadyRef.current = onReady
  }, [onReady])

  useEffect(() => {
    collectedSneakerNumbersRef.current = collectedSneakerNumbers
    effectiveSceneApiRef.current?.syncCollectedSneakerNumbers?.(collectedSneakerNumbers)
  }, [collectedSneakerNumbers, effectiveSceneApiRef])

  useEffect(() => {
    canCollectRef.current = canCollect
    effectiveSceneApiRef.current?.setCollectionEnabled?.(canCollect)
  }, [canCollect, effectiveSceneApiRef])

  useEffect(() => {
    interactionEnabledRef.current = interactionEnabled

    if (typeof interactionEnabled === 'boolean') {
      effectiveSceneApiRef.current?.setInteractionEnabled?.(interactionEnabled)
    }
  }, [effectiveSceneApiRef, interactionEnabled])

  useEffect(() => {
    effectiveSceneApiRef.current?.setSceneMode?.(sceneMode)
  }, [effectiveSceneApiRef, sceneMode])

  useEffect(() => {
    if (!debugIdRef.current) {
      phaserSceneDebugId += 1
      debugIdRef.current = phaserSceneDebugId
    }

    logGameDebug('phaser-canvas:effect-start', {
      debugId: debugIdRef.current,
      sceneMode,
      texturePath,
      objectCount: sceneObjects.length,
      initialScrollX,
      initialScrollY,
      disableDrag,
      initialDimAlpha,
      fadeOnReady,
      className,
    })

    const container = containerRef.current

    if (!container) {
      logGameDebug('phaser-canvas:no-container', {
        debugId: debugIdRef.current,
      })
      return undefined
    }

    let cancelled = false
    let game = null
    let resizeHandler = null

    const init = async () => {
      logGameDebug('phaser-canvas:init-import', {
        debugId: debugIdRef.current,
      })
      const PhaserModule = await import('phaser')
      const Phaser = PhaserModule.default

      if (cancelled) {
        logGameDebug('phaser-canvas:init-cancelled-before-create', {
          debugId: debugIdRef.current,
        })
        return
      }

      class GamePlayScene extends Phaser.Scene {
        preload() {
          this.load.image('game-map', texturePath)
          this.load.image('tutorial-highlight-glow', '/assets/game/glow.webp')
          sceneObjects.forEach((object) => {
            this.load.image(object.key, object.texturePath)
          })
        }

        create() {
          logGameDebug('phaser-scene:create', {
            debugId: debugIdRef.current,
            sceneMode,
            objectCount: sceneObjects.length,
          })
          const PhaserGeom = Phaser.Geom
          const mapTexture = this.textures.get('game-map').getSourceImage()
          const map = this.add
            .image(0, 0, 'game-map')
            .setOrigin(0, 0)
          const tutorialDimOverlay = this.add
            .rectangle(0, 0, 1, 1, 0x000000, 1)
            .setOrigin(0, 0)
            .setScrollFactor(0)
            .setDepth(5_000)
            .setAlpha(initialDimAlpha)
          const tutorialGlow = this.add
            .image(0, 0, 'tutorial-highlight-glow')
            .setOrigin(0.5, 0.5)
            .setDepth(5_001)
            .setAlpha(0)
          sceneObjects.forEach((object) => {
            if (object.interactive) {
              this.textures.get(object.key)?.setFilter(Phaser.Textures.FilterMode.NEAREST)
            }
          })
          const propSprites = sceneObjects.map((object) => ({
            object,
            sprite: this.add.image(0, 0, object.key).setOrigin(0, 0),
            hitZone: object.interactive ? this.add.zone(0, 0, 1, 1).setOrigin(0, 0).setDepth(10_000) : null,
            tween: null,
            scaleTween: null,
          }))
          const propEntriesByKey = new Map(propSprites.map((entry) => [entry.object.key, entry]))
          const frameSequenceEvents = new Map()

          const cam = this.cameras.main
          cam.setScroll(0, 0)
          cam.roundPixels = true
          this.input.addPointer(1)

          let maxScrollX = 0
          let maxScrollY = 0
          let hasInitializedViewport = false
          let currentMapScale = 1
          let currentZoomMultiplier = 1
          let activeFocusObjectKey = null
          let activeHighlightObjectKey = null
          let activeTutorialZoomObjectKey = null
          let activeTutorialZoomRender = null
          let currentSceneMode = sceneMode
          let interactionEnabled = typeof interactionEnabledRef.current === 'boolean'
            ? interactionEnabledRef.current
            : !disableDrag
          let collectionEnabled = canCollectRef.current
          let syncedCollectedSneakerNumbers = new Set(collectedSneakerNumbersRef.current)

          const restoreHighlightDepths = () => {
            propSprites.forEach((entry) => {
              const originalDepth = entry.sprite.getData('originalDepth')
              if (typeof originalDepth === 'number') {
                entry.sprite.setDepth(originalDepth)
              }
            })
          }

          const updateHighlightPosition = () => {
            if (!activeHighlightObjectKey || currentSceneMode !== 'tutorial') {
              tutorialGlow.setAlpha(0)
              return
            }

            const highlightEntry = propEntriesByKey.get(activeHighlightObjectKey)
            const highlightCenterX = highlightEntry?.sprite?.getData('baseCenterX')
            const highlightCenterY = highlightEntry?.sprite?.getData('baseCenterY')
            const highlightWidth = highlightEntry?.sprite?.displayWidth
            const highlightHeight = highlightEntry?.sprite?.displayHeight

            if (
              typeof highlightCenterX !== 'number' ||
              typeof highlightCenterY !== 'number' ||
              typeof highlightWidth !== 'number' ||
              typeof highlightHeight !== 'number'
            ) {
              tutorialGlow.setAlpha(0)
              return
            }

            tutorialGlow.setPosition(highlightCenterX, highlightCenterY)
            tutorialGlow.setDisplaySize(highlightWidth * 2.8, highlightHeight * 2.4)
          }

          const syncCollectedSneakerEntry = (entry) => {
            if (!entry.object.sneakerNumber) {
              return
            }

            const isCollected = syncedCollectedSneakerNumbers.has(entry.object.sneakerNumber)
            entry.sprite.setData('collected', isCollected)

            if (isCollected) {
              entry.sprite.setAlpha(0)
              entry.sprite.disableInteractive()
              entry.hitZone?.disableInteractive()
            }
          }

          const applyEntrySceneState = (entry) => {
            const { object, sprite, hitZone } = entry
            const objectSceneMode = getMapObjectSceneMode(object)
            const isShared = objectSceneMode === 'shared'
            const isCollected = Boolean(sprite.getData('collected'))
            const shouldShowInMode = isShared || objectSceneMode === currentSceneMode
            const shouldShowSprite = shouldShowInMode && (!object.interactive || !isCollected)
            const shouldEnableHitZone = shouldShowInMode && object.interactive && !isCollected && collectionEnabled

            sprite.setVisible(shouldShowSprite)

            if (!shouldShowSprite) {
              sprite.setAlpha(0)
            }

            if (!hitZone) {
              return
            }

            if (shouldEnableHitZone) {
              if (!hitZone.input) {
                hitZone.setInteractive()
              }

              if (hitZone.input) {
                hitZone.input.enabled = true
              }
            } else {
              hitZone.disableInteractive()
            }
          }

          const applySceneMode = (nextSceneMode) => {
            currentSceneMode = nextSceneMode
            tutorialGlow.setVisible(nextSceneMode === 'tutorial')

            if (nextSceneMode !== 'tutorial') {
              activeHighlightObjectKey = null
              tutorialGlow.setAlpha(0)
              restoreHighlightDepths()
            }

            propSprites.forEach((entry) => {
              applyEntrySceneState(entry)
            })
          }

          const collectSneaker = async (entry, pointer, event) => {
            const { object, sprite, hitZone } = entry

            console.log('[game-sneaker] pointerdown', {
              key: object.key,
              sneakerNumber: object.sneakerNumber,
              worldX: object.x,
              worldY: object.y,
              screenX: pointer?.x,
              screenY: pointer?.y,
            })

            event?.stopPropagation?.()
            isDragging = false

            if (!collectionEnabled || sprite.getData('collected') || sprite.getData('collecting')) {
              console.log('[game-sneaker] already collected', {
                key: object.key,
                sneakerNumber: object.sneakerNumber,
              })
              return
            }

            sprite.setData('collecting', true)
            sprite.disableInteractive()
            hitZone?.disableInteractive()

            const containerRect = container.getBoundingClientRect()
            const spriteLeft = containerRect.left + sprite.x - cam.scrollX
            const spriteTop = containerRect.top + sprite.y - cam.scrollY
            const payload = {
              key: object.key,
              number: object.sneakerNumber,
              texturePath: object.texturePath,
              left: spriteLeft,
              top: spriteTop,
              width: sprite.displayWidth,
              height: sprite.displayHeight,
              angle: object.rotation ?? 0,
            }

            const result = await onSneakerCollectRef.current?.(payload)

            if (!result?.accepted) {
              sprite.setData('collecting', false)
              applyEntrySceneState(entry)
              return
            }

            syncedCollectedSneakerNumbers = new Set(result.foundSneakerNumbers ?? [])
            sprite.setData('collected', true)
            sprite.setData('collecting', false)

            this.tweens.add({
              targets: [sprite, hitZone].filter(Boolean),
              alpha: 0,
              duration: 120,
              ease: 'Sine.easeOut',
              onComplete: () => {
                applyEntrySceneState(entry)
              },
            })

            console.log('[game-sneaker] collect animation started', {
              key: object.key,
              sneakerNumber: object.sneakerNumber,
            })
          }

          const playTutorialObjectZoom = (entry) => {
            const { object, sprite, hitZone } = entry

            if (
              activeTutorialZoomObjectKey === object.key
              || sprite.getData('collected')
              || activeHighlightObjectKey !== object.key
            ) {
              return
            }

            activeTutorialZoomObjectKey = object.key
            sprite.setData('collected', true)
            sprite.disableInteractive()
            hitZone?.disableInteractive()
            onTutorialObjectStartRef.current?.(object.key)

            const zoomMultiplier = object.zoomMultiplier ?? 3
            const spriteScreenX = sprite.x - cam.scrollX
            const spriteScreenY = sprite.y - cam.scrollY
            const startGlowX = tutorialGlow.x - cam.scrollX
            const startGlowY = tutorialGlow.y - cam.scrollY
            const zoomSprite = this.add
              .image(spriteScreenX, spriteScreenY, object.key)
              .setOrigin(0, 0)
              .setScrollFactor(0)
              .setDisplaySize(sprite.displayWidth, sprite.displayHeight)
              .setAngle(sprite.angle)
              .setDepth(6_010)
            const zoomGlow = this.add
              .image(startGlowX, startGlowY, 'tutorial-highlight-glow')
              .setOrigin(0.5, 0.5)
              .setScrollFactor(0)
              .setDisplaySize(tutorialGlow.displayWidth, tutorialGlow.displayHeight)
              .setAlpha(tutorialGlow.alpha || 0.9)
              .setBlendMode(Phaser.BlendModes.ADD)
              .setDepth(6_009)
            const canvasBounds = this.game.canvas.getBoundingClientRect()
            const targetRect = getTutorialObjectTargetRectRef.current?.()
            const sourceWidth = zoomSprite.texture.source[0].width
            const sourceHeight = zoomSprite.texture.source[0].height

            let targetWidth = sprite.displayWidth * zoomMultiplier
            let targetHeight = sprite.displayHeight * zoomMultiplier
            let targetX = (cam.width - targetWidth) / 2
            let targetY = (cam.height - targetHeight) / 2

            if (targetRect) {
              const maxWidth = targetRect.width * 0.94
              const maxHeight = targetRect.height * 0.94
              const fitScale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight)

              targetWidth = sourceWidth * fitScale
              targetHeight = sourceHeight * fitScale
              targetX = targetRect.left - canvasBounds.left + ((targetRect.width - targetWidth) / 2)
              targetY = targetRect.top - canvasBounds.top + ((targetRect.height - targetHeight) / 2)
            }

            const glowScaleX = targetWidth / sprite.displayWidth
            const glowScaleY = targetHeight / sprite.displayHeight
            const targetGlowWidth = tutorialGlow.displayWidth * glowScaleX * 0.5
            const targetGlowHeight = tutorialGlow.displayHeight * glowScaleY * 0.5

            this.glowTween?.remove()
            activeHighlightObjectKey = null
            activeTutorialZoomRender = {
              sprite: zoomSprite,
              glow: zoomGlow,
            }

            this.tweens.add({
              targets: [sprite, hitZone].filter(Boolean),
              alpha: 0,
              duration: 180,
              ease: 'Sine.easeOut',
              onComplete: () => {
                applyEntrySceneState(entry)
              },
            })

            this.tweens.add({
              targets: tutorialGlow,
              alpha: 0,
              duration: 180,
              ease: 'Sine.easeOut',
            })

            this.tweens.add({
              targets: zoomSprite,
              x: targetX,
              y: targetY,
              displayWidth: targetWidth,
              displayHeight: targetHeight,
              duration: object.zoomDuration ?? 760,
              ease: 'Cubic.easeInOut',
              onComplete: () => {
                onTutorialObjectCompleteRef.current?.(object.key)
              },
            })

            this.tweens.add({
              targets: zoomGlow,
              x: targetX + (targetWidth / 2),
              y: targetY + (targetHeight / 2),
              displayWidth: targetGlowWidth,
              displayHeight: targetGlowHeight,
              duration: object.zoomDuration ?? 760,
              ease: 'Cubic.easeInOut',
            })
          }

          const syncLoopMotion = (entry, mapScale) => {
            const { object, sprite } = entry
            const loopMotion = object.loopMotion

            if (!loopMotion) {
              entry.tween?.remove()
              entry.tween = null
              return
            }

            const baseY = sprite.getData('baseY')
            if (typeof baseY !== 'number') {
              return
            }

            const closedY = baseY
            const openY = baseY + (loopMotion.travelY * mapScale)

            entry.tween?.remove()
            sprite.y = closedY
            entry.tween = this.tweens.add({
              targets: sprite,
              y: openY,
              duration: loopMotion.duration,
              ease: 'Sine.easeInOut',
              hold: loopMotion.hold ?? 0,
              yoyo: true,
              repeat: -1,
            })
          }

          const startCrossfadeCycle = (entry) => {
            const { object, sprite } = entry
            const alphaCycle = object.alphaCycle

            if (!alphaCycle || alphaCycle.mode !== 'crossfade' || entry.alphaTween) {
              return
            }

            const partnerEntry = propEntriesByKey.get(alphaCycle.partnerKey)
            if (!partnerEntry) {
              return
            }

            sprite.setAlpha(alphaCycle.from ?? 1)

            entry.alphaTween = this.tweens.add({
              targets: sprite,
              alpha: alphaCycle.to ?? 0,
              duration: alphaCycle.duration ?? 1000,
              ease: 'Sine.easeInOut',
              hold: alphaCycle.hold ?? 0,
              yoyo: true,
              repeat: -1,
            })
          }

          const syncLoopScaleX = (entry, mapScale) => {
            const { object, sprite } = entry
            const loopScaleX = object.loopScaleX

            if (!loopScaleX) {
              entry.scaleTween?.remove()
              entry.scaleTween = null
              return
            }

            const baseWidth = sprite.getData('baseWidth')
            const baseHeight = sprite.getData('baseHeight')
            if (typeof baseWidth !== 'number' || typeof baseHeight !== 'number') {
              return
            }

            entry.scaleTween?.remove()
            sprite.setDisplaySize(baseWidth * (loopScaleX.from ?? 1), baseHeight)
            entry.scaleTween = this.tweens.add({
              targets: sprite,
              displayWidth: baseWidth * (loopScaleX.to ?? 0.1),
              duration: loopScaleX.duration ?? 1200,
              ease: 'Sine.easeInOut',
              hold: loopScaleX.hold ?? 0,
              yoyo: true,
              repeat: -1,
            })
          }

          const syncLoopTranslate = (entry, mapScale) => {
            const { object, sprite } = entry
            const loopTranslate = object.loopTranslate

            if (!loopTranslate) {
              entry.translateTween?.remove()
              entry.translateTween = null
              return
            }

            const baseX = sprite.getData('baseX')
            const baseY = sprite.getData('baseY')
            if (typeof baseX !== 'number' || typeof baseY !== 'number') {
              return
            }

            entry.translateTween?.remove()
            const centered = Boolean(loopTranslate.centered)
            const targetTravelX = (loopTranslate.travelX ?? 0) * mapScale
            const targetTravelY = (loopTranslate.travelY ?? 0) * mapScale
            const startX = centered ? baseX - targetTravelX : baseX
            const startY = centered ? baseY - targetTravelY : baseY
            const endX = centered ? baseX + targetTravelX : baseX + targetTravelX
            const endY = centered ? baseY + targetTravelY : baseY + targetTravelY

            sprite.setPosition(startX, startY)
            entry.translateTween = this.tweens.add({
              targets: sprite,
              x: endX,
              y: endY,
              duration: loopTranslate.duration ?? 2200,
              delay: loopTranslate.delay ?? 0,
              ease: 'Sine.easeInOut',
              hold: loopTranslate.hold ?? 0,
              yoyo: true,
              repeat: -1,
            })
          }

          const syncLoopWiggle = (entry, mapScale) => {
            const { object, sprite } = entry
            const loopWiggle = object.loopWiggle

            if (!loopWiggle) {
              entry.wiggleTween?.remove()
              entry.wiggleTween = null
              sprite.setAngle(0)
              return
            }

            const baseCenterX = sprite.getData('baseCenterX')
            const baseCenterY = sprite.getData('baseCenterY')
            if (typeof baseCenterX !== 'number' || typeof baseCenterY !== 'number') {
              return
            }

            entry.wiggleTween?.remove()
            sprite.setPosition(baseCenterX, baseCenterY)
            sprite.setAngle(-(loopWiggle.angle ?? 3))
            entry.wiggleTween = this.tweens.add({
              targets: sprite,
              angle: loopWiggle.angle ?? 3,
              y: baseCenterY + ((loopWiggle.travelY ?? 6) * mapScale),
              duration: loopWiggle.duration ?? 2400,
              delay: loopWiggle.delay ?? 0,
              ease: 'Sine.easeInOut',
              yoyo: true,
              repeat: -1,
            })
          }

          const syncLoopBounce = (entry, mapScale) => {
            const { object, sprite } = entry
            const loopBounce = object.loopBounce

            if (!loopBounce) {
              entry.bounceTween?.remove()
              entry.bounceReturnTween?.remove()
              entry.bounceTween = null
              entry.bounceReturnTween = null
              return
            }

            const baseCenterY = sprite.getData('baseCenterY')
            if (typeof baseCenterY !== 'number') {
              return
            }

            entry.bounceTween?.remove()
            entry.bounceReturnTween?.remove()
            sprite.setY(baseCenterY)
            entry.bounceTween = null
            entry.bounceReturnTween = null

            const runBounceCycle = () => {
              entry.bounceTween = this.tweens.add({
                targets: sprite,
                y: baseCenterY + ((loopBounce.travelY ?? 20) * mapScale),
                duration: loopBounce.duration ?? 700,
                ease: loopBounce.ease ?? 'Quad.easeIn',
                hold: loopBounce.hold ?? 0,
                onComplete: () => {
                  entry.bounceReturnTween = this.tweens.add({
                    targets: sprite,
                    y: baseCenterY,
                    duration: loopBounce.returnDuration ?? Math.max(260, (loopBounce.duration ?? 700) * 0.72),
                    ease: loopBounce.returnEase ?? 'Back.easeOut',
                    onComplete: runBounceCycle,
                  })
                },
              })
            }

            runBounceCycle()
          }

          const syncLoopSwayX = (entry, mapScale) => {
            const { object, sprite } = entry
            const loopSwayX = object.loopSwayX

            if (!loopSwayX) {
              entry.swayTween?.remove()
              entry.swayReturnTween?.remove()
              entry.swayTween = null
              entry.swayReturnTween = null
              return
            }

            const baseX = sprite.getData('baseX')
            if (typeof baseX !== 'number') {
              return
            }

            entry.swayTween?.remove()
            entry.swayReturnTween?.remove()
            sprite.setX(baseX)
            entry.swayTween = null
            entry.swayReturnTween = null

            const runSwayCycle = () => {
              entry.swayTween = this.tweens.add({
                targets: sprite,
                x: baseX + ((loopSwayX.travelX ?? 16) * mapScale),
                duration: loopSwayX.duration ?? 2200,
                ease: loopSwayX.ease ?? 'Sine.easeInOut',
                hold: loopSwayX.hold ?? 0,
                delay: loopSwayX.delay ?? 0,
                onComplete: () => {
                  entry.swayReturnTween = this.tweens.add({
                    targets: sprite,
                    x: baseX,
                    duration: loopSwayX.returnDuration ?? Math.max(900, (loopSwayX.duration ?? 2200) * 0.95),
                    ease: loopSwayX.returnEase ?? 'Sine.easeInOut',
                    onComplete: runSwayCycle,
                  })
                },
              })
            }

            runSwayCycle()
          }

          const syncLoopBlink = (entry) => {
            const { object, sprite } = entry
            const loopBlink = object.loopBlink
            const isCollected = Boolean(sprite.getData('collected'))

            if (!loopBlink) {
              entry.blinkTween?.remove()
              entry.blinkTween = null
              sprite.setAlpha(isCollected ? 0 : 1)
              return
            }

            entry.blinkTween?.remove()
            if (isCollected) {
              sprite.setAlpha(0)
              entry.blinkTween = null
              return
            }
            sprite.setAlpha(loopBlink.from ?? 1)
            entry.blinkTween = this.tweens.add({
              targets: sprite,
              alpha: loopBlink.to ?? 0.4,
              duration: loopBlink.duration ?? 240,
              delay: loopBlink.delay ?? 0,
              hold: loopBlink.hold ?? 120,
              ease: 'Sine.easeInOut',
              yoyo: true,
              repeat: -1,
            })
          }

          const syncLoopBalance = (entry, mapScale) => {
            const { object, sprite } = entry
            const loopBalance = object.loopBalance

            if (!loopBalance) {
              entry.balanceTween?.remove()
              entry.balanceTween = null
              sprite.setAngle(0)
              return
            }

            const baseCenterX = sprite.getData('baseCenterX')
            const baseBottomY = sprite.getData('baseBottomY')
            if (typeof baseCenterX !== 'number' || typeof baseBottomY !== 'number') {
              return
            }

            entry.balanceTween?.remove()
            sprite.setPosition(baseCenterX, baseBottomY)
            sprite.setAngle(-(loopBalance.angle ?? 4))
            entry.balanceTween = this.tweens.add({
              targets: sprite,
              angle: loopBalance.angle ?? 4,
              x: baseCenterX + ((loopBalance.travelX ?? 6) * mapScale),
              duration: loopBalance.duration ?? 1800,
              delay: loopBalance.delay ?? 0,
              ease: 'Sine.easeInOut',
              yoyo: true,
              repeat: -1,
            })
          }

          const syncLoopSwing = (entry) => {
            const { object, sprite } = entry
            const loopSwing = object.loopSwing

            if (!loopSwing) {
              entry.swingTween?.remove()
              entry.swingTween = null
              sprite.setAngle(0)
              return
            }

            const pivotWorldX = sprite.getData('pivotWorldX')
            const pivotWorldY = sprite.getData('pivotWorldY')
            if (typeof pivotWorldX !== 'number' || typeof pivotWorldY !== 'number') {
              return
            }

            entry.swingTween?.remove()
            sprite.setPosition(pivotWorldX, pivotWorldY)
            sprite.setAngle(loopSwing.fromAngle ?? -6)
            entry.swingTween = this.tweens.add({
              targets: sprite,
              angle: loopSwing.toAngle ?? 6,
              duration: loopSwing.duration ?? 520,
              delay: loopSwing.delay ?? 0,
              ease: 'Sine.easeInOut',
              yoyo: true,
              repeat: -1,
            })
          }

          const syncLoopPulse = (entry) => {
            const { object, sprite } = entry
            const loopPulse = object.loopPulse
            const baseScaleX = sprite.getData('baseScaleX')
            const baseScaleY = sprite.getData('baseScaleY')

            if (!loopPulse) {
              entry.pulseTween?.remove()
              entry.pulseTween = null
              if (typeof baseScaleX === 'number' && typeof baseScaleY === 'number') {
                sprite.setScale(baseScaleX, baseScaleY)
              }
              return
            }

            if (typeof baseScaleX !== 'number' || typeof baseScaleY !== 'number') {
              return
            }

            entry.pulseTween?.remove()
            sprite.setScale(
              baseScaleX * (loopPulse.from ?? 0.9),
              baseScaleY * (loopPulse.from ?? 0.9),
            )
            entry.pulseTween = this.tweens.add({
              targets: sprite,
              scaleX: baseScaleX * (loopPulse.to ?? 1.08),
              scaleY: baseScaleY * (loopPulse.to ?? 1.08),
              duration: loopPulse.duration ?? 1400,
              delay: loopPulse.delay ?? 0,
              ease: 'Sine.easeInOut',
              yoyo: true,
              repeat: -1,
            })
          }

          const startFrameSequences = () => {
            const groups = new Map()

            propSprites.forEach((entry) => {
              const sequence = entry.object.frameSequence
              if (!sequence) {
                return
              }

              const group = groups.get(sequence.groupKey) ?? []
              group.push(entry)
              groups.set(sequence.groupKey, group)
            })

            groups.forEach((entries, groupKey) => {
              if (frameSequenceEvents.has(groupKey)) {
                return
              }

              const sortedEntries = [...entries].sort(
                (a, b) => (a.object.frameSequence?.frameIndex ?? 0) - (b.object.frameSequence?.frameIndex ?? 0),
              )
              const firstSequence = sortedEntries[0]?.object.frameSequence
              const stepDuration = firstSequence?.stepDuration ?? 180
              const fadeFrames = Boolean(firstSequence?.fade)
              const dimAlpha = firstSequence?.dimAlpha ?? 0
              let activeIndex = 0

              const applyFrame = () => {
                sortedEntries.forEach((sequenceEntry, index) => {
                  const targetAlpha = index === activeIndex ? 1 : dimAlpha

                  if (fadeFrames) {
                    sequenceEntry.frameTween?.remove()
                    sequenceEntry.frameTween = this.tweens.add({
                      targets: sequenceEntry.sprite,
                      alpha: targetAlpha,
                      duration: Math.max(120, stepDuration * 0.72),
                      ease: 'Sine.easeInOut',
                    })
                  } else {
                    sequenceEntry.sprite.setAlpha(targetAlpha)
                  }
                })
                activeIndex = (activeIndex + 1) % sortedEntries.length
              }

              applyFrame()
              const event = this.time.addEvent({
                delay: stepDuration,
                loop: true,
                callback: applyFrame,
              })
              frameSequenceEvents.set(groupKey, event)
            })
          }

          const updateViewport = (width, height, focusObjectKey = activeFocusObjectKey) => {
            const worldWidth = width * GAME_MAP_OVERSCAN_X * currentZoomMultiplier
            const mapScale = worldWidth / mapTexture.width
            const worldHeight = mapTexture.height * mapScale
            currentMapScale = mapScale
            const mobileInteractiveScale = width <= 768 ? MOBILE_INTERACTIVE_SNEAKER_SCALE : 1

            map.setDisplaySize(worldWidth, worldHeight)

            propSprites.forEach((entry) => {
              const { object, sprite, hitZone } = entry
              const source = sprite.texture.source[0]
              const objectScale = (object.scale ?? 1) * (object.interactive ? mobileInteractiveScale : 1)
              const baseWidth = (object.width ?? source.width) * objectScale
              const baseHeight = object.height ?? (baseWidth * (source.height / source.width))
              const rawScaledWidth = baseWidth * mapScale
              const rawScaledHeight = baseHeight * mapScale
              const scaledWidth = object.interactive ? Math.max(1, Math.round(rawScaledWidth)) : rawScaledWidth
              const scaledHeight = object.interactive ? Math.max(1, Math.round(rawScaledHeight)) : rawScaledHeight
              const baseX = (object.x + (object.offsetX ?? 0)) * mapScale
              const baseY = (object.y + (object.offsetY ?? 0)) * mapScale

              const anchorRight = object.loopScaleX?.anchor === 'right'
              const centerOrigin = Boolean(object.loopWiggle)
              const bottomCenterOrigin = Boolean(object.loopBalance)
              const customSwingPivot = object.loopSwing
              const anchorBottom = object.anchorY === 'bottom'
              const hasCustomAnchorX = typeof object.anchorX === 'string'
              const hasCustomAnchorY = typeof object.anchorY === 'string'
              const customAnchorX = object.anchorX === 'center' ? 0.5 : object.anchorX === 'right' ? 1 : 0
              const customAnchorY = object.anchorY === 'center' ? 0.5 : object.anchorY === 'bottom' ? 1 : 0

              let originX
              let originY
              let positionedX
              let positionedY

              if (customSwingPivot) {
                originX = customSwingPivot.pivotX
                originY = customSwingPivot.pivotY
                positionedX = baseX + (scaledWidth * customSwingPivot.pivotX)
                positionedY = baseY + (scaledHeight * customSwingPivot.pivotY)
              } else {
                originX = hasCustomAnchorX
                  ? customAnchorX
                  : centerOrigin || bottomCenterOrigin
                    ? 0.5
                    : anchorRight ? 1 : 0
                originY = hasCustomAnchorY
                  ? customAnchorY
                  : centerOrigin
                    ? 0.5
                    : bottomCenterOrigin || anchorBottom ? 1 : 0

                positionedX = hasCustomAnchorX
                  ? baseX
                  : centerOrigin || bottomCenterOrigin
                    ? baseX + (scaledWidth / 2)
                    : anchorRight ? baseX + scaledWidth : baseX
                positionedY = hasCustomAnchorY
                  ? baseY
                  : centerOrigin
                    ? baseY + (scaledHeight / 2)
                    : bottomCenterOrigin || anchorBottom ? baseY + scaledHeight : baseY
              }

              sprite.setOrigin(originX, originY)
              sprite.setPosition(positionedX, positionedY)
              sprite.setDisplaySize(scaledWidth, scaledHeight)
              sprite.setDepth(object.depth ?? 1)
              sprite.setData('originalDepth', object.depth ?? 1)

              if (object.interactive) {
                const hitLeft = positionedX - (originX * scaledWidth)
                const hitTop = positionedY - (originY * scaledHeight)

                if (hitZone) {
                  hitZone.setPosition(hitLeft, hitTop)
                  hitZone.setSize(scaledWidth, scaledHeight)
                  hitZone.setDisplaySize?.(scaledWidth, scaledHeight)

                  if (!hitZone.input) {
                    hitZone.setInteractive(
                      new PhaserGeom.Rectangle(0, 0, scaledWidth, scaledHeight),
                      PhaserGeom.Rectangle.Contains,
                    )
                  } else if (hitZone.input.hitArea?.setTo) {
                    hitZone.input.hitArea.setTo(0, 0, scaledWidth, scaledHeight)
                  } else {
                    hitZone.input.hitArea.width = scaledWidth
                    hitZone.input.hitArea.height = scaledHeight
                  }
                }
              }

              sprite.setData('baseX', baseX)
              sprite.setData('baseY', baseY)
              sprite.setData('baseWidth', scaledWidth)
              sprite.setData('baseHeight', scaledHeight)
              sprite.setData('baseScaleX', sprite.scaleX)
              sprite.setData('baseScaleY', sprite.scaleY)
              sprite.setData('baseCenterX', baseX + (scaledWidth / 2))
              sprite.setData('baseCenterY', baseY + (scaledHeight / 2))
              sprite.setData('baseBottomY', baseY + scaledHeight)
              sprite.setData('pivotWorldX', baseX + (scaledWidth * (customSwingPivot?.pivotX ?? 0)))
              sprite.setData('pivotWorldY', baseY + (scaledHeight * (customSwingPivot?.pivotY ?? 0)))
              syncCollectedSneakerEntry(entry)
              syncLoopMotion(entry, mapScale)
              syncLoopScaleX(entry, mapScale)
              syncLoopTranslate(entry, mapScale)
              syncLoopWiggle(entry, mapScale)
              syncLoopBounce(entry, mapScale)
              syncLoopSwayX(entry, mapScale)
              syncLoopBlink(entry)
              syncLoopBalance(entry, mapScale)
              syncLoopSwing(entry)
              syncLoopPulse(entry)

              if (object.interactive && hitZone) {
                hitZone.off('pointerdown')
                hitZone.on('pointerdown', (pointer, _localX, _localY, event) => {
                  if (object.clickAction === 'tutorialZoom') {
                    event?.stopPropagation?.()
                    isDragging = false
                    playTutorialObjectZoom(entry)
                    return
                  }

                  collectSneaker(entry, pointer, event)
                })
              }

              applyEntrySceneState(entry)
            })

            tutorialDimOverlay.setSize(width, height)
            tutorialDimOverlay.setDisplaySize(width, height)
            updateHighlightPosition()

            cam.setBounds(0, 0, worldWidth, worldHeight)

            if (cam.setSize) {
              cam.setSize(width, height)
            } else {
              cam.setViewport(0, 0, width, height)
            }

            maxScrollX = Math.max(0, worldWidth - width)
            maxScrollY = Math.max(0, worldHeight - height)

            if (focusObjectKey) {
              const focusEntry = propEntriesByKey.get(focusObjectKey)
              const focusCenterX = focusEntry?.sprite?.getData('baseCenterX')
              const focusCenterY = focusEntry?.sprite?.getData('baseCenterY')

              if (typeof focusCenterX === 'number' && typeof focusCenterY === 'number') {
                cam.scrollX = Phaser.Math.Clamp(focusCenterX - (cam.width / 2), 0, maxScrollX)
                cam.scrollY = Phaser.Math.Clamp(focusCenterY - (cam.height / 2), 0, maxScrollY)
                hasInitializedViewport = true
                return
              }
            }

            if (!hasInitializedViewport) {
              cam.scrollX = Phaser.Math.Clamp(initialScrollX, 0, maxScrollX)
              cam.scrollY = Phaser.Math.Clamp(initialScrollY, 0, maxScrollY)
              hasInitializedViewport = true
            } else {
              cam.scrollX = Phaser.Math.Clamp(cam.scrollX, 0, maxScrollX)
              cam.scrollY = Phaser.Math.Clamp(cam.scrollY, 0, maxScrollY)
            }
          }

          this.focusOnObject = (objectKey, options = {}) => {
            const entry = propEntriesByKey.get(objectKey)

            if (!entry?.sprite) {
              return
            }

            const targetCenterX = entry.sprite.getData('baseCenterX')
            const targetCenterY = entry.sprite.getData('baseCenterY')

            if (typeof targetCenterX !== 'number' || typeof targetCenterY !== 'number') {
              return
            }

            const targetScrollX = Phaser.Math.Clamp(targetCenterX - (cam.width / 2), 0, maxScrollX)
            const targetScrollY = Phaser.Math.Clamp(targetCenterY - (cam.height / 2), 0, maxScrollY)

            activeFocusObjectKey = objectKey
            this.focusTween?.remove()
            this.focusTween = this.tweens.add({
              targets: cam,
              scrollX: targetScrollX,
              scrollY: targetScrollY,
              duration: options.duration ?? 760,
              ease: options.ease ?? 'Cubic.easeInOut',
              onComplete: () => {
                options.onComplete?.()
              },
            })
          }

          this.zoomToObject = (objectKey, options = {}) => {
            const entry = propEntriesByKey.get(objectKey)

            if (!entry?.sprite) {
              return
            }

            activeFocusObjectKey = objectKey
            this.zoomTween?.remove()

            const zoomState = { zoom: currentZoomMultiplier }
            this.zoomTween = this.tweens.add({
              targets: zoomState,
              zoom: options.zoomMultiplier ?? 2,
              duration: options.duration ?? 720,
              ease: options.ease ?? 'Cubic.easeInOut',
              onUpdate: () => {
                currentZoomMultiplier = zoomState.zoom
                updateViewport(this.scale.width, this.scale.height, objectKey)
              },
              onComplete: () => {
                currentZoomMultiplier = zoomState.zoom
                updateViewport(this.scale.width, this.scale.height, objectKey)
                options.onComplete?.()
              },
            })
          }

          this.setTutorialSceneDim = (alpha = 0.7, options = {}) => {
            this.dimTween?.remove()
            this.dimTween = this.tweens.add({
              targets: tutorialDimOverlay,
              alpha,
              duration: options.duration ?? 420,
              ease: options.ease ?? 'Sine.easeInOut',
            })
          }

          this.setSceneMode = (nextSceneMode = 'gameplay') => {
            interactionEnabled = nextSceneMode === 'gameplay'
            applySceneMode(nextSceneMode)
            updateViewport(this.scale.width, this.scale.height, activeFocusObjectKey)
          }

          this.setCollectionEnabled = (nextValue) => {
            collectionEnabled = Boolean(nextValue)
            propSprites.forEach((entry) => {
              applyEntrySceneState(entry)
            })
          }

          this.setInteractionEnabled = (nextValue) => {
            interactionEnabled = Boolean(nextValue)
          }

          this.syncCollectedSneakerNumbers = (numbers = []) => {
            syncedCollectedSneakerNumbers = new Set(numbers)
            propSprites.forEach((entry) => {
              syncCollectedSneakerEntry(entry)
              applyEntrySceneState(entry)
            })
          }

          this.enterGameplayMode = (options = {}) => {
            const duration = options.duration ?? 420
            const startZoom = currentZoomMultiplier
            const startScrollX = cam.scrollX
            const startScrollY = cam.scrollY
            const targetScrollX = options.scrollX ?? GAME_START_SCROLL_X
            const targetScrollY = options.scrollY ?? GAME_START_SCROLL_Y
            const transitionState = { progress: 0 }

            activeFocusObjectKey = null
            activeHighlightObjectKey = null
            interactionEnabled = true

            this.focusTween?.remove()
            this.zoomTween?.remove()
            this.glowTween?.remove()
            restoreHighlightDepths()
            tutorialGlow.setAlpha(0)
            tutorialGlow.setVisible(false)
            applySceneMode('gameplay')
            updateViewport(this.scale.width, this.scale.height)
            this.setTutorialSceneDim(0, { duration })

            this.gameplayTransitionTween?.remove()
            this.gameplayTransitionTween = this.tweens.add({
              targets: transitionState,
              progress: 1,
              duration,
              ease: options.ease ?? 'Cubic.easeInOut',
              onUpdate: () => {
                currentZoomMultiplier = Phaser.Math.Linear(startZoom, 1, transitionState.progress)
                updateViewport(this.scale.width, this.scale.height)
                cam.scrollX = Phaser.Math.Clamp(
                  Phaser.Math.Linear(startScrollX, targetScrollX, transitionState.progress),
                  0,
                  maxScrollX,
                )
                cam.scrollY = Phaser.Math.Clamp(
                  Phaser.Math.Linear(startScrollY, targetScrollY, transitionState.progress),
                  0,
                  maxScrollY,
                )
              },
              onComplete: () => {
                currentZoomMultiplier = 1
                updateViewport(this.scale.width, this.scale.height)
                cam.scrollX = Phaser.Math.Clamp(targetScrollX, 0, maxScrollX)
                cam.scrollY = Phaser.Math.Clamp(targetScrollY, 0, maxScrollY)
                options.onComplete?.()
              },
            })
          }

          this.showTutorialHighlight = (objectKey, options = {}) => {
            const highlightEntry = propEntriesByKey.get(objectKey)

            if (!highlightEntry?.sprite) {
              return
            }

            activeHighlightObjectKey = objectKey
            restoreHighlightDepths()
            highlightEntry.sprite.setDepth(options.objectDepth ?? 5_002)
            updateHighlightPosition()

            this.glowTween?.remove()
            tutorialGlow.setAlpha(0)
            this.glowTween = this.tweens.add({
              targets: tutorialGlow,
              alpha: options.glowAlpha ?? 0.9,
              duration: options.duration ?? 520,
              ease: options.ease ?? 'Sine.easeInOut',
            })
          }

          this.hideTutorialZoomObject = (options = {}) => {
            if (!activeTutorialZoomRender) {
              options.onComplete?.()
              return
            }

            this.tutorialZoomHideTween?.remove()
            this.tutorialZoomHideTween = this.tweens.add({
              targets: [activeTutorialZoomRender.sprite, activeTutorialZoomRender.glow].filter(Boolean),
              alpha: 0,
              duration: options.duration ?? 280,
              ease: options.ease ?? 'Sine.easeOut',
              onComplete: () => {
                activeTutorialZoomRender?.sprite?.destroy()
                activeTutorialZoomRender?.glow?.destroy()
                activeTutorialZoomRender = null
                options.onComplete?.()
              },
            })
          }

          let dragOriginX = 0
          let dragOriginY = 0
          let startScrollX = 0
          let startScrollY = 0
          let isDragging = false
          let pointerDownHitInteractive = false
          let isPinching = false
          let pinchStartDistance = 0
          let pinchStartZoom = 1

          const getPinchPointers = () => {
            const pointers = [this.input.pointer1, this.input.pointer2].filter((pointer) => pointer?.isDown)
            return pointers.length >= 2 ? pointers.slice(0, 2) : null
          }

          const startPinch = () => {
            if (!interactionEnabled) {
              return
            }

            const pointers = getPinchPointers()

            if (!pointers) {
              return
            }

            const [pointerA, pointerB] = pointers
            pinchStartDistance = Phaser.Math.Distance.Between(pointerA.x, pointerA.y, pointerB.x, pointerB.y)
            pinchStartZoom = currentZoomMultiplier
            isPinching = pinchStartDistance > 0
            isDragging = false
            pointerDownHitInteractive = false
          }

          const updatePinchZoom = () => {
            if (!interactionEnabled || !isPinching) {
              return
            }

            const pointers = getPinchPointers()

            if (!pointers || pinchStartDistance <= 0) {
              isPinching = false
              return
            }

            const [pointerA, pointerB] = pointers
            const distance = Phaser.Math.Distance.Between(pointerA.x, pointerA.y, pointerB.x, pointerB.y)

            if (distance <= 0) {
              return
            }

            const centerX = (pointerA.x + pointerB.x) / 2
            const centerY = (pointerA.y + pointerB.y) / 2
            const mapPointX = (cam.scrollX + centerX) / currentMapScale
            const mapPointY = (cam.scrollY + centerY) / currentMapScale
            const nextZoom = Phaser.Math.Clamp(
              pinchStartZoom * (distance / pinchStartDistance),
              1,
              GAME_MAP_MAX_PINCH_ZOOM,
            )

            if (Math.abs(nextZoom - currentZoomMultiplier) < 0.001) {
              return
            }

            currentZoomMultiplier = nextZoom
            updateViewport(this.scale.width, this.scale.height)

            cam.scrollX = Phaser.Math.Clamp((mapPointX * currentMapScale) - centerX, 0, maxScrollX)
            cam.scrollY = Phaser.Math.Clamp((mapPointY * currentMapScale) - centerY, 0, maxScrollY)
          }

          this.input.on('pointerdown', (pointer) => {
            if (!interactionEnabled) {
              return
            }

            if (getPinchPointers()) {
              startPinch()
              return
            }

            const interactiveSprites = propSprites
              .filter((entry) => entry.object.interactive && !entry.sprite.getData('collected') && entry.hitZone?.input?.enabled)
              .map((entry) => entry.hitZone)
            const hitTargets = []

            this.input.manager.hitTest(pointer, interactiveSprites, cam, hitTargets)

            if (hitTargets.length > 0) {
              console.log('[game-map] pointerdown hit interactive sprite', {
                pointerX: pointer.x,
                pointerY: pointer.y,
                hitCount: hitTargets.length,
                keys: hitTargets.map((target) => target.texture?.key ?? 'unknown'),
              })
              pointerDownHitInteractive = true
              isDragging = false
              return
            }

            console.log('[game-map] pointerdown starts drag', {
              pointerX: pointer.x,
              pointerY: pointer.y,
              interactiveCount: interactiveSprites.length,
            })
            pointerDownHitInteractive = false
            isDragging = true
            dragOriginX = pointer.x
            dragOriginY = pointer.y
            startScrollX = cam.scrollX
            startScrollY = cam.scrollY
          })

          this.input.on('pointermove', (pointer) => {
            if (!interactionEnabled) {
              return
            }

            if (isPinching) {
              updatePinchZoom()
              return
            }

            if (!isDragging || !pointer.isDown) {
              return
            }

            const nextScrollX = startScrollX - (pointer.x - dragOriginX)
            const nextScrollY = startScrollY - (pointer.y - dragOriginY)

            cam.scrollX = Phaser.Math.Clamp(nextScrollX, 0, maxScrollX)
            cam.scrollY = Phaser.Math.Clamp(nextScrollY, 0, maxScrollY)
          })

          this.input.on('pointerup', () => {
            if (isPinching) {
              if (!getPinchPointers()) {
                isPinching = false
              }
              isDragging = false
              pointerDownHitInteractive = false
              return
            }

            pointerDownHitInteractive = false
            isDragging = false
          })

          this.input.on('pointerupoutside', () => {
            isPinching = false
            pointerDownHitInteractive = false
            isDragging = false
          })

          updateViewport(this.scale.width, this.scale.height)
          effectiveSceneApiRef.current = {
            focusOnObject: (objectKey, options = {}) => this.focusOnObject?.(objectKey, options),
            zoomToObject: (objectKey, options = {}) => this.zoomToObject?.(objectKey, options),
            setTutorialSceneDim: (alpha, options = {}) => this.setTutorialSceneDim?.(alpha, options),
            setSceneMode: (nextSceneMode) => this.setSceneMode?.(nextSceneMode),
            setCollectionEnabled: (nextValue) => this.setCollectionEnabled?.(nextValue),
            setInteractionEnabled: (nextValue) => this.setInteractionEnabled?.(nextValue),
            syncCollectedSneakerNumbers: (numbers = []) => this.syncCollectedSneakerNumbers?.(numbers),
            enterGameplayMode: (options = {}) => this.enterGameplayMode?.(options),
            showTutorialHighlight: (objectKey, options = {}) => this.showTutorialHighlight?.(objectKey, options),
            hideTutorialZoomObject: (options = {}) => this.hideTutorialZoomObject?.(options),
          }
          this.syncCollectedSneakerNumbers(collectedSneakerNumbersRef.current)
          this.setCollectionEnabled(canCollectRef.current)

          if (typeof interactionEnabledRef.current === 'boolean') {
            this.setInteractionEnabled(interactionEnabledRef.current)
          }

          propSprites.forEach((entry) => {
            startCrossfadeCycle(entry)
          })
          startFrameSequences()
          logGameDebug('phaser-scene:ready-callback', {
            debugId: debugIdRef.current,
            sceneMode: currentSceneMode,
          })
          onReadyRef.current?.()
          this.scale.on('resize', (gameSize) => {
            updateViewport(gameSize.width, gameSize.height, activeFocusObjectKey)
          })
        }
      }

      const initialWidth = Math.max(container.clientWidth || 0, 320)
      const initialHeight = Math.max(container.clientHeight || 0, window.innerHeight || 568)
      logGameDebug('phaser-canvas:create-game', {
        debugId: debugIdRef.current,
        initialWidth,
        initialHeight,
      })

      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: container,
        width: initialWidth,
        height: initialHeight,
        backgroundColor: '#000000',
        render: {
          antialias: true,
          pixelArt: true,
          roundPixels: true,
        },
        scene: GamePlayScene,
        scale: {
          mode: Phaser.Scale.RESIZE,
          autoCenter: Phaser.Scale.NO_CENTER,
          width: initialWidth,
          height: initialHeight,
        },
      })

      resizeHandler = () => {
        if (!game || !container) {
          return
        }

        const nextWidth = Math.max(container.clientWidth || 0, 320)
        const nextHeight = Math.max(container.clientHeight || 0, window.innerHeight || 568)
        game.scale.resize(nextWidth, nextHeight)
      }

      window.addEventListener('resize', resizeHandler)
    }

    init()

    return () => {
      cancelled = true
      logGameDebug('phaser-canvas:cleanup', {
        debugId: debugIdRef.current,
        sceneMode,
      })
      effectiveSceneApiRef.current = null
      if (resizeHandler) {
        window.removeEventListener('resize', resizeHandler)
      }
      logGameDebug('phaser-canvas:destroy-game', {
        debugId: debugIdRef.current,
      })
      game?.destroy(true)
    }
  }, [texturePath, sceneObjects, initialScrollX, initialScrollY, effectiveSceneApiRef, initialDimAlpha])

  return (
    <div
      ref={containerRef}
      className={`phaser-map-canvas absolute inset-0 ${fadeOnReady ? 'transition-opacity duration-300' : ''} ${className}`.trim()}
    />
  )
}

function MapTutorialScreen({
  className = '',
  onStartGame = null,
  gameplayActive = false,
  gameplayBindings = null,
}) {
  const [phase, setPhase] = useState('intro')
  const mapSceneApiRef = useRef(null)
  const foundSneakerSlotRef = useRef(null)
  const friendsTransitionTimeoutRef = useRef(0)
  const introInitDataLoggedRef = useRef(false)
  const getTutorialObjectTargetRect = useCallback(
    () => foundSneakerSlotRef.current?.getBoundingClientRect() ?? null,
    [],
  )

  useEffect(() => () => {
    if (friendsTransitionTimeoutRef.current) {
      window.clearTimeout(friendsTransitionTimeoutRef.current)
    }
  }, [])

  useEffect(() => {
    logGameDebug('tutorial:phase-change', {
      phase,
      gameplayActive,
      hasBindings: Boolean(gameplayBindings),
    })
  }, [gameplayActive, gameplayBindings, phase])

  useEffect(() => {
    if (phase !== 'intro' || introInitDataLoggedRef.current) {
      return
    }

    const initData = getTelegramWebApp()?.initData?.trim() ?? null
    console.log('Telegram initData on intro:', initData)
    introInitDataLoggedRef.current = true
  }, [phase])

  const startFocusSequence = useCallback(() => {
    if (phase !== 'intro') {
      return
    }

    logGameDebug('tutorial:start-focus-sequence')
    setPhase('focusing')
    mapSceneApiRef.current?.setTutorialSceneDim(0.7, { duration: 420 })

    mapSceneApiRef.current?.focusOnObject('tutorial-map-sneaker-1', {
      duration: 620,
      onComplete: () => {
        setPhase('zooming')
        mapSceneApiRef.current?.zoomToObject('tutorial-map-sneaker-1', {
          zoomMultiplier: 1.2,
          duration: 700,
          onComplete: () => {
            mapSceneApiRef.current?.showTutorialHighlight('tutorial-map-sneaker-1', {
              glowAlpha: 0.9,
              duration: 520,
            })
            setPhase('focused')
          },
        })
      },
    })
  }, [phase])

  const showFriendsStep = useCallback(() => {
    if (phase !== 'collected') {
      return
    }

    logGameDebug('tutorial:show-friends-step')
    mapSceneApiRef.current?.hideTutorialZoomObject({
      duration: 300,
    })
    setPhase('transitioning-to-friends')
    friendsTransitionTimeoutRef.current = window.setTimeout(() => {
      setPhase('friends')
    }, 320)
  }, [phase])

  const startGameStep = useCallback(() => {
    if (phase !== 'friends') {
      return
    }

    logGameDebug('tutorial:start-game-step', {
      hasEnterGameplayMode: Boolean(mapSceneApiRef.current?.enterGameplayMode),
    })
    setPhase('starting-game')

    if (!mapSceneApiRef.current?.enterGameplayMode) {
      onStartGame?.()
      return
    }

    mapSceneApiRef.current.enterGameplayMode({
      duration: 760,
      onComplete: () => {
        onStartGame?.()
      },
    })
  }, [onStartGame, phase])

  return (
    <main className={`relative min-h-svh overflow-hidden bg-black text-white ${className}`.trim()}>
      <section className="relative min-h-svh overflow-hidden">
        <DraggableGameMapCanvas
          texturePath="/assets/map-full.webp"
          sceneObjects={seamlessMapSceneObjects}
          onSneakerCollect={gameplayActive ? gameplayBindings?.onSneakerCollect ?? null : null}
          collectedSneakerNumbers={gameplayActive ? gameplayBindings?.collectedSneakerNumbers ?? [1] : [1]}
          canCollect={gameplayActive ? gameplayBindings?.canCollect ?? false : true}
          interactionEnabled={gameplayActive}
          onTutorialObjectStart={gameplayActive ? null : () => setPhase('collecting')}
          onTutorialObjectComplete={gameplayActive ? null : () => setPhase('collected')}
          getTutorialObjectTargetRect={getTutorialObjectTargetRect}
          initialScrollX={GAME_START_SCROLL_X}
          initialScrollY={TUTORIAL_START_SCROLL_Y}
          disableDrag={!gameplayActive}
          sceneMode={gameplayActive ? 'gameplay' : 'tutorial'}
          sceneApiRef={mapSceneApiRef}
          initialDimAlpha={0.7}
        />
        <div className="pointer-events-none absolute inset-x-0 top-0 z-[2] h-[134px] bg-[linear-gradient(180deg,_#000000_0%,_rgba(0,0,0,0)_100%)]" />

        <div
          className={`pointer-events-none absolute inset-0 z-10 grid min-h-svh w-full grid-rows-[1fr_auto] justify-items-center transition-opacity duration-300 ${
            phase === 'intro' ? 'visible opacity-100' : 'invisible opacity-0'
          }`}
          style={{
            paddingTop: TG_SAFE_INTRO_TOP,
            paddingBottom: TG_SAFE_CONTENT_BOTTOM,
            paddingLeft: `calc(${TG_SAFE_CONTENT_LEFT} + 1.75rem)`,
            paddingRight: `calc(${TG_SAFE_CONTENT_RIGHT} + 1.75rem)`,
          }}
        >
          <div className="flex h-full w-full items-center justify-center">
            <div
              className="grid w-full max-w-[min(22rem,calc(100vw-3.5rem))] justify-items-center"
              style={{
                gridTemplateRows: 'auto 220px auto',
              }}
            >
              <h1 className="intro-grid-item intro-grid-item-1 map-instruction-title self-end pb-[18px] text-center font-display text-[clamp(2.25rem,10vw,4rem)] leading-[0.92] text-white">
                Что делать
                <br />
                с картой?
              </h1>

              <div className="intro-grid-item intro-grid-item-2 flex h-[220px] w-full items-center justify-center" aria-hidden="true">
                <img
                  src="/assets/hand.webp"
                  alt=""
                  className="map-hand pointer-events-none h-auto w-[clamp(3.35rem,15vw,4.275rem)]"
                />
              </div>

              <div className="intro-grid-item intro-grid-item-3 w-full max-w-[min(20rem,calc(100vw-4rem))] self-start pt-[18px] text-center text-[clamp(0.92rem,4.1vw,1.44rem)] leading-[0.96] text-white">
                <p>
                  <span className="block whitespace-nowrap">Приближайте и отдаляйте локации,</span>
                  <span className="block whitespace-nowrap">изучайте зоны сверху и снизу.</span>
                  <span className="block whitespace-nowrap">Кроссовки хорошо спрятаны,</span>
                  <span className="block whitespace-nowrap">но и вы не первый день</span>
                  <span className="block whitespace-nowrap">в профессиональном шопинге :)</span>
                </p>
              </div>
            </div>
          </div>

          <div className="flex w-full flex-col items-center gap-5 pb-[28px]">
            <div className="intro-grid-item intro-grid-item-4 pointer-events-auto">
              <RibbonButton label="Далее" onClick={startFocusSequence} />
            </div>
          </div>
        </div>

        <div className="pointer-events-none absolute inset-0 z-20">
          <img
            src="/assets/hand.webp"
            alt=""
            aria-hidden="true"
            className={`map-hand absolute left-1/2 top-1/2 h-auto w-[clamp(3.35rem,15vw,4.275rem)] translate-x-[1rem] translate-y-[1.85rem] rotate-150 transition-opacity duration-300 ${
              phase === 'focused' ? 'opacity-100' : 'opacity-0'
            }`}
          />

          <div
            className={`absolute left-1/2 w-full max-w-[min(21rem,calc(100vw-2.75rem))] -translate-x-1/2 px-4 text-center font-display text-[clamp(0.9rem,4.2vw,1.25rem)] leading-[1.16] text-white transition-opacity duration-300 ${
              phase === 'focused' ? 'opacity-100' : 'opacity-0'
            }`}
            style={{ top: 'calc(50% + 7.75rem)' }}
          >
            <p>
              <span className="block whitespace-nowrap">Видите подсвеченный элемент?</span>
              <span className="block whitespace-nowrap">Нажмите на него, кроссовки</span>
              <span className="block whitespace-nowrap">спрятаны где-то там.</span>
            </p>
          </div>
        </div>

        <div
          aria-hidden={phase !== 'collected' && phase !== 'transitioning-to-friends'}
          className={`absolute inset-0 z-30 grid min-h-svh w-full grid-rows-[1fr_auto] justify-items-center transition-opacity duration-300 ${
            phase === 'collected' ? 'pointer-events-none visible opacity-100' : 'pointer-events-none invisible opacity-0'
          }`}
          style={{
            paddingTop: TG_SAFE_INTRO_TOP,
            paddingBottom: TG_SAFE_CONTENT_BOTTOM,
            paddingLeft: `calc(${TG_SAFE_CONTENT_LEFT} + 1.75rem)`,
            paddingRight: `calc(${TG_SAFE_CONTENT_RIGHT} + 1.75rem)`,
          }}
        >
          <div className="flex h-full w-full items-center justify-center">
            <div
              className="grid w-full max-w-[min(22rem,calc(100vw-3.5rem))] justify-items-center"
              style={{
                gridTemplateRows: 'auto 220px auto',
              }}
            >
              <h2 className="intro-grid-item intro-grid-item-1 self-end pb-[18px] text-center font-display text-[clamp(2.25rem,10vw,4rem)] leading-[0.92] text-white">
                Отличное
                <br />
                начало!
              </h2>

              <div ref={foundSneakerSlotRef} className="h-[260px] w-full" aria-hidden="true" />

              <div className="intro-grid-item intro-grid-item-3 w-full max-w-[min(20rem,calc(100vw-4rem))] self-start pt-[18px] text-center text-[clamp(1.05rem,4.7vw,1.5rem)] leading-[0.96] text-white">
                <p>
                  {tutorialFoundCopy.body.map((line, index) => (
                    line ? (
                      <span key={`${line}-${index}`} className="block">
                        {line}
                      </span>
                    ) : (
                      <span key={`space-${index}`} className="block h-[1.1em]" aria-hidden="true" />
                    )
                  ))}
                </p>
              </div>
            </div>
          </div>

          <div className="flex w-full flex-col items-center gap-5 pb-[28px]">
            <div className={`intro-grid-item intro-grid-item-4 ${phase === 'collected' ? 'pointer-events-auto' : 'pointer-events-none'}`}>
              <RibbonButton label="Далее" onClick={showFriendsStep} />
            </div>
          </div>
        </div>

        <div
          aria-hidden={phase !== 'friends'}
          className={`absolute inset-0 z-40 grid min-h-svh w-full grid-rows-[1fr_auto] justify-items-center transition-opacity duration-300 ${
            phase === 'friends'
              ? 'pointer-events-none visible opacity-100'
              : 'pointer-events-none invisible opacity-0'
          }`}
          style={{
            paddingTop: TG_SAFE_INTRO_TOP,
            paddingBottom: TG_SAFE_CONTENT_BOTTOM,
            paddingLeft: `calc(${TG_SAFE_CONTENT_LEFT} + 1.75rem)`,
            paddingRight: `calc(${TG_SAFE_CONTENT_RIGHT} + 1.75rem)`,
          }}
        >
          <div className="flex h-full w-full items-center justify-center">
            <div
              className="grid w-full max-w-[min(22rem,calc(100vw-3.5rem))] justify-items-center"
              style={{
                gridTemplateRows: 'auto 220px auto',
              }}
            >
              <h1 className="intro-grid-item intro-grid-item-1 self-end pb-[18px] text-center font-display text-[clamp(2.25rem,10vw,4rem)] leading-[0.92] text-white">
                Расследование
                <br />
                заходит в тупик?
              </h1>

              <div className="flex h-[220px] w-full items-center justify-center" aria-hidden="true">
                <img
                  src="/assets/game/friends.webp"
                  alt=""
                  className="h-auto w-[clamp(6.1rem,27.3vw,8.6rem)]"
                />
              </div>

              <div className="intro-grid-item intro-grid-item-3 w-full max-w-[min(20rem,calc(100vw-4rem))] self-start pt-[18px] text-center text-white">
                <div className="text-center font-display text-[clamp(1.15rem,5vw,1.6rem)] leading-[1.05] text-white">
                  {friendsScreenCopy.kicker}
                </div>

                <div className="mt-6 text-[clamp(1rem,4.5vw,1.45rem)] leading-[0.98] text-white">
                  <p>
                    {friendsScreenCopy.body.map((line) => (
                      <span key={line} className="block">
                        {line}
                      </span>
                    ))}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex w-full flex-col items-center gap-5 pb-[28px]">
            <div className={`intro-grid-item intro-grid-item-4 ${phase === 'friends' ? 'pointer-events-auto' : 'pointer-events-none'}`}>
              <RibbonButton label="Играть" onClick={startGameStep} />
            </div>
          </div>
        </div>

      </section>
    </main>
  )
}

function requestMiniAppFullscreen() {
  requestTelegramFullscreen()

  const root = document.documentElement

  if (root.requestFullscreen && !document.fullscreenElement) {
    root.requestFullscreen().catch(() => {})
  }
}

function SneakerCollectionOverlay({ onClose, foundSneakerNumbers = [1] }) {
  const foundSneakerSet = new Set(foundSneakerNumbers)
  const designRef = useRef(null)
  const [viewport, setViewport] = useState({
    width: MOBILE_CANVAS_WIDTH,
    height: MOBILE_CANVAS_HEIGHT,
  })
  const [safeInsets, setSafeInsets] = useState({
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  })
  const [viewMode, setViewMode] = useState('grid')
  const [cardTransition, setCardTransition] = useState(null)
  const [selectedCard, setSelectedCard] = useState({
    number: '01',
    numeric: 1,
    assetSrc: '/assets/game/sneakers%20new/sneakers1.webp',
  })

  const posterCards = [
    selectedCard.numeric === 1
      ? selectedCard
      : { number: '01', numeric: 1, assetSrc: '/assets/game/sneakers%20new/sneakers1.webp' },
    { number: '02', numeric: 2, assetSrc: '/assets/game/sneakers%20new/sneakers2.webp' },
    { number: '03', numeric: 3, assetSrc: '/assets/game/sneakers%20new/sneakers3.webp' },
    { number: '04', numeric: 4, assetSrc: '/assets/game/sneakers%20new/sneakers4.webp' },
    { number: '05', numeric: 5, assetSrc: '/assets/game/sneakers%20new/sneakers5.webp' },
    { number: '06', numeric: 6, assetSrc: '/assets/game/sneakers%20new/sneakers6.webp' },
    { number: '07', numeric: 7, assetSrc: '/assets/game/sneakers%20new/sneakers7.webp' },
    { number: '08', numeric: 8, assetSrc: '/assets/game/sneakers%20new/sneakers8.webp' },
    { number: '09', numeric: 9, assetSrc: '/assets/game/sneakers%20new/sneakers9.webp' },
    { number: '10', numeric: 10, assetSrc: '/assets/game/sneakers%20new/sneakers10.webp' },
  ]
  const topGridCards = posterCards.slice(0, 9)
  const bottomCard = posterCards[9]

  useEffect(() => {
    const syncViewport = () => {
      const nextSafeInsets = {
        top: Math.max(
          readSafeInsetPx('--tg-safe-area-inset-top'),
          readSafeInsetPx('--tg-content-safe-area-inset-top'),
        ),
        right: Math.max(
          readSafeInsetPx('--tg-safe-area-inset-right'),
          readSafeInsetPx('--tg-content-safe-area-inset-right'),
        ),
        bottom: Math.max(
          readSafeInsetPx('--tg-safe-area-inset-bottom'),
          readSafeInsetPx('--tg-content-safe-area-inset-bottom'),
        ),
        left: Math.max(
          readSafeInsetPx('--tg-safe-area-inset-left'),
          readSafeInsetPx('--tg-content-safe-area-inset-left'),
        ),
      }

      setViewport({
        width: window.innerWidth || MOBILE_CANVAS_WIDTH,
        height: window.innerHeight || MOBILE_CANVAS_HEIGHT,
      })
      setSafeInsets(nextSafeInsets)
    }

    syncViewport()
    window.addEventListener('resize', syncViewport)

    return () => window.removeEventListener('resize', syncViewport)
  }, [])

  const collectionScale = Math.min(
    Math.max(viewport.width - safeInsets.left - safeInsets.right, 0) / MOBILE_CANVAS_WIDTH,
    Math.max(viewport.height - safeInsets.top - safeInsets.bottom, 0) / MOBILE_CANVAS_HEIGHT,
  )

  useEffect(() => {
    if (viewMode !== 'opening') {
      return undefined
    }

    const settleTimeout = window.setTimeout(() => {
      setViewMode('poster')
    }, 460)

    return () => window.clearTimeout(settleTimeout)
  }, [viewMode])

  const closePoster = () => {
    setViewMode('grid')
    setCardTransition(null)
  }

  const openPoster = (card, element) => {
    if (!designRef.current || !element || viewMode !== 'grid') {
      return
    }

    const designRect = designRef.current.getBoundingClientRect()
    const cardRect = element.getBoundingClientRect()
    const scale = collectionScale || 1
    const targetWidth = 328
    const targetHeight = 432
    const targetLeft = (MOBILE_CANVAS_WIDTH - targetWidth) / 2
    const targetTop = 179

    setSelectedCard(card)
    setCardTransition({
      fromLeft: (cardRect.left - designRect.left) / scale,
      fromTop: (cardRect.top - designRect.top) / scale,
      fromWidth: cardRect.width / scale,
      fromHeight: cardRect.height / scale,
      toLeft: targetLeft,
      toTop: targetTop,
      toWidth: targetWidth,
      toHeight: targetHeight,
    })
    setViewMode('opening')
  }

  const cardTransitionActive = viewMode === 'opening' || viewMode === 'poster'
  const showPosterChrome = viewMode === 'poster'
  const openingCardNumber = cardTransitionActive ? selectedCard.numeric : null

  return (
    <div className="pointer-events-auto absolute inset-0 z-50 overflow-hidden bg-[#3d5064] screen-grain">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[134px] bg-[linear-gradient(180deg,_#000000_0%,_rgba(0,0,0,0)_100%)]" />
      <div
        className="absolute inset-0 flex items-center justify-center overflow-hidden"
        style={{
          paddingTop: `${safeInsets.top}px`,
          paddingRight: `${safeInsets.right}px`,
          paddingBottom: `${safeInsets.bottom}px`,
          paddingLeft: `${safeInsets.left}px`,
        }}
      >
        <div
          ref={designRef}
          className="relative h-[844px] w-[390px] origin-center text-white"
          style={{ transform: `scale(${collectionScale})` }}
        >
          <div
            className={`relative z-10 grid h-full w-full grid-rows-[auto_auto_1fr] px-4 pb-[18px] pt-[40px] transition-opacity duration-300 ${
              viewMode === 'grid' ? 'opacity-100' : 'pointer-events-none opacity-0'
            }`}
            style={{
              rowGap: 'clamp(20px, calc(100% * 0.038), 32px)',
            }}
          >
            <div className="flex justify-center">
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="mt-[9px] flex h-[18px] w-[27px] shrink-0 translate-y-[4px] items-center justify-center"
                >
                  <img
                    src="/assets/game/ui/sneakers-ui/arrow-back.svg"
                    alt="Назад"
                    className="h-[18px] w-[27px]"
                  />
                </button>

                <div className="relative h-[48px] w-[259px] shrink-0">
                  <img
                    src="/assets/game/ui/sneakers-ui/sneakers-back.svg"
                    alt=""
                    aria-hidden="true"
                    className="h-full w-full"
                  />
                  <div className="absolute inset-y-0 left-[22px] flex items-center pb-[2px]">
                    <span className="font-display text-[33px] leading-none text-white">
                      Кроссовки
                    </span>
                  </div>
                  <div className="absolute right-[12px] top-[8px] text-right font-display leading-none text-[#D9FCAB]">
                    <span className="block text-[11px]">Найдено:</span>
                    <span className="mt-[2px] block text-[18px]">{foundSneakerNumbers.length}/{TOTAL_SNEAKER_COUNT}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-center self-center">
              <div className="flex items-start gap-3">
                <img
                  src="/assets/game/ui/sneakers-ui/target.svg"
                  alt=""
                  aria-hidden="true"
                  className="mt-[2px] h-6 w-6 shrink-0"
                />
                <p className="font-display text-[16px] leading-[1.02] text-white">
                  Находи кроссовки, открывай
                  <br />
                  постеры и собирай всю коллекцию
                </p>
              </div>
            </div>

            <div className="grid h-full min-h-0 content-start overflow-hidden">
              <div className="grid h-full min-h-0 w-full grid-cols-3 grid-rows-[repeat(4,minmax(0,1fr))] justify-items-center gap-x-[12px] gap-y-[clamp(12px,calc(100%*0.022),20px)] overflow-hidden">
                {topGridCards.map((card) => {
                  const isFound = foundSneakerSet.has(card.numeric)

                  if (isFound) {
                    return (
                      <button
                        key={card.number}
                        type="button"
                        onClick={(event) => openPoster(card, event.currentTarget)}
                        className="relative aspect-[95/130] h-full w-auto max-h-full transition duration-200 hover:scale-[1.02] active:scale-[0.98]"
                      >
                        <img
                          src="/assets/game/ui/sneakers-ui/open-card-small.webp"
                          alt=""
                          aria-hidden="true"
                          className="h-full w-full"
                        />
                        <span className="absolute left-[3px] top-[3px] bg-black px-[4px] py-[2px] font-display text-[12px] leading-none text-[#D9FCAB]">
                          {card.number}
                        </span>
                        {openingCardNumber !== card.numeric ? (
                          <img
                            src={card.assetSrc}
                            alt={`Кроссовок ${card.number}`}
                            className="absolute left-1/2 top-1/2 w-[78%] -translate-x-1/2 -translate-y-1/2"
                          />
                        ) : null}
                      </button>
                    )
                  }

                  return (
                    <div
                      key={card.number}
                      className="relative aspect-[95/130] h-full w-auto max-h-full"
                    >
                      <img
                        src="/assets/game/ui/sneakers-ui/hidden-card-small.webp"
                        alt=""
                        aria-hidden="true"
                        className="h-full w-full"
                      />
                      <span className="absolute left-[3px] top-[3px] bg-black px-[4px] py-[2px] font-display text-[12px] leading-none text-[#D9FCAB]">
                        {card.number}
                      </span>
                    </div>
                  )
                })}

                {foundSneakerSet.has(bottomCard.numeric) ? (
                  <button
                    type="button"
                    onClick={(event) => openPoster(bottomCard, event.currentTarget)}
                    className="relative aspect-[95/130] h-full w-auto max-h-full shrink-0 transition duration-200 hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <img
                      src="/assets/game/ui/sneakers-ui/open-card-small.webp"
                      alt=""
                      aria-hidden="true"
                      className="h-full w-full"
                    />
                    {openingCardNumber !== bottomCard.numeric ? (
                      <span className="absolute left-[3px] top-[3px] bg-black px-[4px] py-[2px] font-display text-[12px] leading-none text-[#D9FCAB]">
                        {bottomCard.number}
                      </span>
                    ) : null}
                    {openingCardNumber !== bottomCard.numeric ? (
                      <img
                        src={bottomCard.assetSrc}
                        alt={`Кроссовок ${bottomCard.number}`}
                        className="absolute left-1/2 top-1/2 w-[78%] -translate-x-1/2 -translate-y-1/2"
                      />
                    ) : null}
                  </button>
                ) : (
                  <div
                    className="relative aspect-[95/130] h-full w-auto max-h-full shrink-0"
                  >
                    <img
                      src="/assets/game/ui/sneakers-ui/hidden-card-small.webp"
                      alt=""
                      aria-hidden="true"
                      className="h-full w-full"
                    />
                    <span className="absolute left-[3px] top-[3px] bg-black px-[4px] py-[2px] font-display text-[12px] leading-none text-[#D9FCAB]">
                      {bottomCard.number}
                    </span>
                  </div>
                )}

                <div className="col-span-2 flex min-h-0 items-center justify-self-start self-stretch overflow-hidden pl-[8px]">
                  <p className="font-display text-[16px] leading-[1.02] text-white">
                    Нажми на найденный
                    <br />
                    кроссовок, чтобы увидеть
                    <br />
                    постер кампании
                  </p>
                </div>
              </div>
            </div>
          </div>

          {cardTransition ? (
            <div className="pointer-events-none absolute inset-0 z-20">
              <div
                className="absolute transition-all duration-[460ms] ease-[cubic-bezier(0.2,0.9,0.2,1)]"
                style={{
                  left: `${showPosterChrome ? cardTransition.toLeft : cardTransition.fromLeft}px`,
                  top: `${showPosterChrome ? cardTransition.toTop : cardTransition.fromTop}px`,
                  width: `${showPosterChrome ? cardTransition.toWidth : cardTransition.fromWidth}px`,
                  height: `${showPosterChrome ? cardTransition.toHeight : cardTransition.fromHeight}px`,
                }}
              >
                <img
                  src={showPosterChrome ? '/assets/game/ui/sneakers-ui/open-card-big.webp' : '/assets/game/ui/sneakers-ui/open-card-small.webp'}
                  alt=""
                  aria-hidden="true"
                  className="h-full w-full"
                />
                {!showPosterChrome ? (
                  <span className="absolute left-[3px] top-[3px] bg-black px-[4px] py-[2px] font-display text-[12px] leading-none text-[#D9FCAB]">
                    {selectedCard.number}
                  </span>
                ) : null}
                <div
                  className={`absolute left-1/2 top-1/2 transition-all duration-[460ms] ease-[cubic-bezier(0.2,0.9,0.2,1)] ${
                    showPosterChrome ? 'opacity-0' : 'opacity-100'
                  }`}
                  style={{
                    width: showPosterChrome ? '164px' : '74px',
                    transform: 'translate(-50%, -50%)',
                  }}
                >
                  <img
                    src={selectedCard.assetSrc}
                    alt=""
                    aria-hidden="true"
                    className="h-auto w-full"
                  />
                </div>
              </div>
            </div>
          ) : null}

          <div
            className={`absolute inset-0 z-30 transition-opacity duration-300 ${
              showPosterChrome ? 'opacity-100' : 'pointer-events-none opacity-0'
            }`}
          >
            <div className="relative flex h-full w-full flex-col px-4 pb-[18px] pt-[40px]">
              <div className="relative flex justify-center">
                <button
                  type="button"
                  onClick={closePoster}
                  className="absolute left-[35px] top-[13px] flex h-[18px] w-[27px] items-center justify-center"
                >
                  <img
                    src="/assets/game/ui/sneakers-ui/arrow-back.svg"
                    alt="Назад"
                    className="h-[18px] w-[27px]"
                  />
                </button>

                <div className="relative h-[48px] w-[197px] shrink-0">
                  <img
                    src="/assets/game/ui/sneakers-ui/poster-text.svg"
                    alt=""
                    aria-hidden="true"
                    className="mt-[1px] h-[45px] w-full"
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="font-display text-[31px] leading-none text-[#D9FCAB]">
                      Постер {selectedCard.number}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-7 flex flex-1 items-center justify-center">
                <div className="relative aspect-[660/902] w-full max-w-[328px]">
                  <img
                    src="/assets/game/ui/sneakers-ui/open-card-big.webp"
                    alt={`Постер ${selectedCard.number}`}
                    className="h-full w-full"
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <img
                      src={selectedCard.assetSrc}
                      alt="Найденный кроссовок"
                      className="h-auto w-[clamp(10rem,52vw,13.5rem)]"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-center pb-[34px]">
                <button type="button" className="pixel-button-intro w-[188.811px]">
                  <ButtonSvg
                    width="188.811"
                    className="absolute inset-0 h-full w-full"
                  />
                  <span
                    aria-hidden="true"
                    className="start-ribbon-bob pointer-events-none absolute -bottom-[6px] -left-8 z-[-1] block h-[1.128rem] w-[2.375rem]"
                  >
                    <span className="ribbon-reveal-inner block h-full w-full overflow-hidden">
                      <img
                        src="/assets/game/svg/start-button-green.svg"
                        alt=""
                        className="h-auto w-[2.375rem] max-w-none"
                      />
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    className="end-ribbon-wiggle pointer-events-none absolute -right-12 top-[calc(-1rem+1px)] z-20 block h-[2.4375rem] w-[6.85rem]"
                  >
                    <span className="ribbon-reveal-inner block h-full w-full overflow-hidden">
                      <img
                        src="/assets/game/svg/end-button-green.svg"
                        alt=""
                        className="h-auto w-[6.85rem] max-w-none"
                      />
                    </span>
                  </span>
                  <span className="button-text-dark relative z-10 flex items-center gap-[6px]">
                    <span>Скачать</span>
                    <img
                      src="/assets/game/ui/sneakers-ui/save.svg"
                      alt=""
                      aria-hidden="true"
                      className="h-6 w-[23px]"
                    />
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function useGamePlayUiState({
  initialFoundSneakerNumbers = [1],
  syncedFoundSneakerNumbers = [1],
  onCollectSneaker = null,
}) {
  const [isAboutOpen, setIsAboutOpen] = useState(false)
  const [isSneakersOpen, setIsSneakersOpen] = useState(false)
  const [foundSneakerNumbers, setFoundSneakerNumbers] = useState(initialFoundSneakerNumbers)
  const [flySneaker, setFlySneaker] = useState(null)
  const sneakersPanelRef = useRef(null)

  const openAbout = useCallback(() => {
    setIsSneakersOpen(false)
    setIsAboutOpen(true)
  }, [])

  const openSneakers = useCallback(() => {
    setIsAboutOpen(false)
    setIsSneakersOpen(true)
  }, [])

  const closeAbout = useCallback(() => {
    setIsAboutOpen(false)
  }, [])

  const closeSneakers = useCallback(() => {
    setIsSneakersOpen(false)
  }, [])

  useEffect(() => {
    if (!Array.isArray(syncedFoundSneakerNumbers)) {
      return
    }

    setFoundSneakerNumbers(syncedFoundSneakerNumbers)
  }, [syncedFoundSneakerNumbers])

  const handleSneakerCollect = useCallback(async (payload) => {
    if (!payload?.number) {
      return { accepted: false }
    }

    const result = onCollectSneaker
      ? await onCollectSneaker(payload)
      : {
          accepted: true,
          foundSneakerNumbers: [...foundSneakerNumbers, payload.number].sort((a, b) => a - b),
        }

    if (!result?.accepted) {
      return { accepted: false }
    }

    const nextFoundSneakerNumbers = Array.isArray(result.foundSneakerNumbers)
      ? result.foundSneakerNumbers
      : [...foundSneakerNumbers, payload.number].sort((a, b) => a - b)

    const panelRect = sneakersPanelRef.current?.getBoundingClientRect()

    if (!panelRect) {
      setFoundSneakerNumbers(nextFoundSneakerNumbers)
      return {
        accepted: true,
        foundSneakerNumbers: nextFoundSneakerNumbers,
      }
    }

    const startWidth = payload.width
    const startHeight = payload.height
    const targetHeight = Math.max(panelRect.height * 0.76, 14)
    const targetWidth = targetHeight * (startWidth / startHeight)

    setFlySneaker({
      id: `${payload.key}-${Date.now()}`,
      number: payload.number,
      texturePath: payload.texturePath,
      fromLeft: payload.left,
      fromTop: payload.top,
      fromWidth: startWidth,
      fromHeight: startHeight,
      toLeft: panelRect.left + ((panelRect.width - targetWidth) / 2),
      toTop: panelRect.top + ((panelRect.height - targetHeight) / 2),
      toWidth: targetWidth,
      toHeight: targetHeight,
      angle: payload.angle ?? 0,
      animate: false,
      nextFoundSneakerNumbers,
    })

    return {
      accepted: true,
      foundSneakerNumbers: nextFoundSneakerNumbers,
    }
  }, [foundSneakerNumbers, onCollectSneaker])

  useEffect(() => {
    if (!flySneaker || flySneaker.animate) {
      return undefined
    }

    const rafId = window.requestAnimationFrame(() => {
      setFlySneaker((prev) => (prev ? { ...prev, animate: true } : prev))
    })

    return () => window.cancelAnimationFrame(rafId)
  }, [flySneaker])

  useEffect(() => {
    if (!flySneaker?.animate) {
      return undefined
    }

    const completeTimeout = window.setTimeout(() => {
      setFoundSneakerNumbers(flySneaker.nextFoundSneakerNumbers ?? foundSneakerNumbers)
      setFlySneaker(null)
    }, 720)

    return () => window.clearTimeout(completeTimeout)
  }, [flySneaker, foundSneakerNumbers])

  return {
    isAboutOpen,
    isSneakersOpen,
    foundSneakerNumbers,
    flySneaker,
    sneakersPanelRef,
    openAbout,
    openSneakers,
    closeAbout,
    closeSneakers,
    handleSneakerCollect,
  }
}

function GamePlayOverlay({
  player,
  isAboutOpen,
  isSneakersOpen,
  foundSneakerNumbers,
  flySneaker,
  sneakersPanelRef,
  remainingSeconds = 0,
  requestError = null,
  onOpenAbout,
  onOpenSneakers,
  onCloseAbout,
  onCloseSneakers,
  onTimerTap,
  isDebugPanelOpen,
  isDeletingPlayer = false,
  debugErrorMessage = '',
  onDeletePlayer,
  onCloseDebugPanel,
  className = 'absolute inset-0 z-20',
}) {
  const countdown = formatRemainingSeconds(remainingSeconds)

  return (
    <div className={`pointer-events-none ${className}`.trim()}>
      {flySneaker ? (
        <div className="pointer-events-none fixed inset-0 z-30">
          <img
            src={flySneaker.texturePath}
            alt=""
            aria-hidden="true"
            className="absolute transition-all duration-[720ms] ease-[cubic-bezier(0.2,0.9,0.2,1)]"
            style={{
              left: `${flySneaker.animate ? flySneaker.toLeft : flySneaker.fromLeft}px`,
              top: `${flySneaker.animate ? flySneaker.toTop : flySneaker.fromTop}px`,
              width: `${flySneaker.animate ? flySneaker.toWidth : flySneaker.fromWidth}px`,
              height: `${flySneaker.animate ? flySneaker.toHeight : flySneaker.fromHeight}px`,
              opacity: flySneaker.animate ? 0.2 : 1,
              transform: `rotate(${flySneaker.animate ? 0 : flySneaker.angle}deg)`,
            }}
          />
        </div>
      ) : null}

      {isAboutOpen ? (
        <div className="pointer-events-none absolute inset-0 z-30 bg-black/45" />
      ) : null}

      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center"
        style={{
          paddingTop: TG_SAFE_UI_TOP,
          paddingLeft: `calc(${TG_SAFE_CONTENT_LEFT} + 1rem)`,
          paddingRight: `calc(${TG_SAFE_CONTENT_RIGHT} + 1rem)`,
        }}
      >
        <div className="mt-[35px] flex w-full max-w-[358px] items-start justify-center gap-4">
          <div className="relative flex h-[128px] w-[92px] items-start justify-center">
            <button type="button" className="pointer-events-auto block w-[92px]" onClick={onOpenAbout}>
              <img
                src="/assets/game/ui/about.webp"
                alt="Как играть"
                className="h-auto w-[92px] shrink-0"
              />
            </button>
          </div>
          <div className="relative flex h-[128px] w-[107px] items-start justify-center">
            <button
              type="button"
              className="pointer-events-auto block w-[107px]"
              onClick={onOpenSneakers}
            >
              <img
                src="/assets/game/ui/sneakers.webp"
                alt="Коллекция кроссовок"
                className="-translate-y-[10px] h-auto w-[107px] shrink-0"
              />
            </button>
            <div ref={sneakersPanelRef} className="pointer-events-none absolute bottom-[40px] left-1/2 h-[21px] w-[57px] -translate-x-1/2">
              <img
                src="/assets/game/ui/panel.webp"
                alt=""
                aria-hidden="true"
                className="h-full w-full"
              />
              <div className="absolute inset-0 flex items-center justify-center gap-[2px] text-center font-display text-[12px] font-normal leading-none text-[#D9FCAB]">
                <span>{foundSneakerNumbers.length}</span>
                <span>/</span>
                <span>{TOTAL_SNEAKER_COUNT}</span>
              </div>
            </div>
          </div>
          <div className="relative flex h-[128px] w-[108px] items-start">
            <img
              src="/assets/game/ui/time.webp"
              alt="Таймер"
              className="-translate-y-[23px] h-auto w-[108px] shrink-0"
            />
            <button
              type="button"
              className="pointer-events-auto absolute inset-0 z-10 appearance-none border-0 bg-transparent p-0"
              onClick={onTimerTap}
            >
              <span className="sr-only">Открыть debug panel</span>
            </button>
            <div className="pointer-events-none absolute bottom-[40px] left-1/2 h-[21px] w-[57px] -translate-x-1/2">
              <img
                src="/assets/game/ui/panel.webp"
                alt=""
                aria-hidden="true"
                className="h-full w-full"
              />
              <div className="absolute inset-0 flex items-center justify-center gap-[2px] text-center font-display text-[12px] font-normal leading-none text-[#D9FCAB]">
                <span>{countdown.minutes}</span>
                <span>:</span>
                <span>{countdown.seconds}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-end"
        style={{
          paddingBottom: TG_SAFE_CONTENT_BOTTOM,
          paddingLeft: `calc(${TG_SAFE_CONTENT_LEFT} + 1rem)`,
          paddingRight: `calc(${TG_SAFE_CONTENT_RIGHT} + 1rem)`,
        }}
        >
          <button type="button" className="pointer-events-auto mb-[28px]">
            <img
              src="/assets/game/ui/friends.webp"
              alt="Кнопка друзей"
            className="h-auto w-[84px] shrink-0"
          />
        </button>
      </div>

      {isAboutOpen ? (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center"
          style={{
            paddingTop: TG_SAFE_CONTENT_TOP,
            paddingRight: `calc(${TG_SAFE_CONTENT_RIGHT} + 0.75rem)`,
            paddingBottom: TG_SAFE_CONTENT_BOTTOM,
            paddingLeft: `calc(${TG_SAFE_CONTENT_LEFT} + 0.75rem)`,
          }}
        >
          <div className="pointer-events-auto relative w-full max-w-[352px]">
            <img
              src="/assets/game/ui/popup.webp"
              alt=""
              aria-hidden="true"
              className="h-auto w-full"
            />

            <div className="absolute inset-x-[20px] top-[36px] bottom-[24px] flex flex-col">
              <div className="flex justify-center">
                <img
                  src="/assets/game/ui/text-popup.webp"
                  alt="Как играть?"
                  className="h-auto w-[254px]"
                />
              </div>

              <div className="mt-[20px] flex h-[65px] items-center gap-5">
                <img src="/assets/game/ui/sneakers.webp" alt="" aria-hidden="true" className="h-auto w-[92px] shrink-0" />
                <p className="font-display text-[16px] leading-[1.02] text-black">
                  10 пар кроссовок
                  <br />
                  Adidas спрятаны
                  <br />
                  на карте
                </p>
              </div>

              <div className="mt-[18px] h-[2px] w-full bg-[repeating-linear-gradient(to_right,rgba(0,0,0,0.35)_0_14px,transparent_14px_24px)]" />

              <div className="mt-[18px] flex h-[65px] items-center gap-5">
                <img src="/assets/game/ui/time.webp" alt="" aria-hidden="true" className="h-auto w-[92px] shrink-0" />
                <p className="font-display text-[16px] leading-[1.02] text-black">
                  10 минут на поиск
                  <br />
                  и то, чтобы собрать
                  <br />
                  всю коллекцию
                </p>
              </div>

              <div className="mt-[18px] h-[2px] w-full bg-[repeating-linear-gradient(to_right,rgba(0,0,0,0.35)_0_14px,transparent_14px_24px)]" />

              <div className="mt-[18px] flex h-[65px] items-center gap-5">
                <img src="/assets/game/ui/money.webp" alt="" aria-hidden="true" className="h-auto w-[92px] shrink-0" />
                <p className="font-display text-[16px] leading-[1.02] text-black">
                  10 сертификатов
                  <br />
                  по 10 000 рублей
                  <br />
                  на шопинг на Lamoda
                  <br />
                  в финальном розыгрыше
                </p>
              </div>

              <div className="mt-[18px] h-[2px] w-full bg-[repeating-linear-gradient(to_right,rgba(0,0,0,0.35)_0_14px,transparent_14px_24px)]" />

              <div className="mt-[18px] flex items-center gap-5">
                <img src="/assets/game/ui/friends.webp" alt="" aria-hidden="true" className="h-auto w-[92px] shrink-0" />
                <p className="font-display text-[16px] leading-[1.02] text-black">
                  С друзьями интереснее!
                  <br />
                  Приглашайте их
                  <br />
                  в игру и получите
                  <br />
                  три подсказки, а также
                  <br />
                  промокод на покупки
                  <br />
                  на Lamoda
                </p>
              </div>

              <div className="mt-auto flex justify-center pb-[10px]">
                <RibbonButton
                  label="Понятно"
                  onClick={onCloseAbout}
                  startRibbonSrc="/assets/svg/start-button.svg"
                  endRibbonSrc="/assets/svg/end-button.svg"
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isSneakersOpen ? (
        <SneakerCollectionOverlay
          onClose={onCloseSneakers}
          foundSneakerNumbers={foundSneakerNumbers}
        />
      ) : null}

      {isDebugPanelOpen ? (
        <DebugPanel
          player={player}
          isDeleting={isDeletingPlayer}
          errorMessage={debugErrorMessage}
          onDeletePlayer={onDeletePlayer}
          onClose={onCloseDebugPanel}
        />
      ) : null}

      {requestError ? (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center"
          style={{
            paddingBottom: `calc(${TG_SAFE_CONTENT_BOTTOM} + 7rem)`,
            paddingLeft: `calc(${TG_SAFE_CONTENT_LEFT} + 1rem)`,
            paddingRight: `calc(${TG_SAFE_CONTENT_RIGHT} + 1rem)`,
          }}
        >
          <div className="rounded-full border border-[#d9fcab] bg-[rgba(0,0,0,0.85)] px-4 py-2 text-center font-display text-[0.92rem] leading-none text-white">
            {requestError.message}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function GamePlayScreen({
  embedded = false,
  className = '',
  authToken,
  player = null,
  initialGameState = null,
  autoStart = false,
  loadingMode = 'default',
  renderCanvas = true,
  onSceneBindingsChange = null,
  onSceneReadyChange = null,
}) {
  const [isSceneReady, setIsSceneReady] = useState(false)
  const [isDebugPanelOpen, setIsDebugPanelOpen] = useState(false)
  const [isDeletingPlayer, setIsDeletingPlayer] = useState(false)
  const [debugErrorMessage, setDebugErrorMessage] = useState('')
  const debugTapTimestampsRef = useRef([])
  const serverGame = useServerGameSession({
    token: authToken,
    initialGameState,
    autoStart,
  })
  const gameplayUi = useGamePlayUiState({
    initialFoundSneakerNumbers: serverGame.session?.foundSneakerNumbers ?? [1],
    syncedFoundSneakerNumbers: serverGame.session?.foundSneakerNumbers ?? [1],
    onCollectSneaker: async (payload) => {
      const result = await serverGame.collectSessionSneaker(payload.number)

      return {
        accepted: result.accepted,
        foundSneakerNumbers: result.session?.foundSneakerNumbers ?? null,
      }
    },
  })
  const finishRequestedRef = useRef(false)
  const RootTag = embedded ? 'div' : 'main'
  const sceneKey = serverGame.session?.id ?? serverGame.lifecycle
  const rootClassName = embedded && !renderCanvas
    ? `${className} pointer-events-none`.trim()
    : (embedded ? className : 'relative min-h-svh overflow-hidden bg-black text-white')
  const sectionClassName = renderCanvas
    ? 'relative min-h-svh overflow-hidden'
    : 'pointer-events-none relative min-h-svh overflow-hidden'

  useEffect(() => {
    logGameDebug('gameplay-screen:mount', {
      embedded,
      renderCanvas,
      loadingMode,
      sceneKey,
      hasInitialSession: Boolean(initialGameState?.session),
      playerId: player?.id ?? null,
    })

    return () => {
      logGameDebug('gameplay-screen:unmount', {
        embedded,
        renderCanvas,
        loadingMode,
        sceneKey,
      })
    }
  }, [embedded, initialGameState?.session, loadingMode, player?.id, renderCanvas, sceneKey])

  useEffect(() => {
    if (!renderCanvas) {
      logGameDebug('gameplay-screen:skip-scene-ready-reset', {
        sceneKey,
      })
      return
    }

    logGameDebug('gameplay-screen:reset-scene-ready', {
      sceneKey,
      renderCanvas,
    })
    setIsSceneReady(false)
  }, [renderCanvas, sceneKey])

  useEffect(() => {
    logGameDebug('gameplay-screen:scene-state', {
      embedded,
      renderCanvas,
      loadingMode,
      sceneKey,
      isSceneReady,
      requestState: serverGame.requestState,
      lifecycle: serverGame.lifecycle,
      sessionStatus: serverGame.session?.status ?? null,
      sessionId: serverGame.session?.id ?? null,
    })
  }, [
    embedded,
    isSceneReady,
    loadingMode,
    renderCanvas,
    sceneKey,
    serverGame.lifecycle,
    serverGame.requestState,
    serverGame.session?.id,
    serverGame.session?.status,
  ])

  useEffect(() => {
    if (!onSceneReadyChange) {
      return undefined
    }

    if (!renderCanvas) {
      onSceneReadyChange(true)
      return () => {
        onSceneReadyChange(false)
      }
    }

    if (!isSceneReady) {
      onSceneReadyChange(false)
      return undefined
    }

    let frameId = 0
    frameId = window.requestAnimationFrame(() => {
      onSceneReadyChange(true)
    })

    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId)
      }

      onSceneReadyChange(false)
    }
  }, [isSceneReady, onSceneReadyChange, renderCanvas])

  useEffect(() => {
    if (!onSceneBindingsChange) {
      return undefined
    }

    onSceneBindingsChange({
      canCollect: serverGame.session?.canCollect ?? false,
      collectedSneakerNumbers: serverGame.session?.foundSneakerNumbers ?? [1],
      onSneakerCollect: gameplayUi.handleSneakerCollect,
    })

    return () => {
      onSceneBindingsChange(null)
    }
  }, [
    gameplayUi.handleSneakerCollect,
    onSceneBindingsChange,
    serverGame.session?.canCollect,
    serverGame.session?.foundSneakerNumbers,
  ])

  const handleTimerTap = useCallback(() => {
    const now = Date.now()
    const nextTimestamps = [
      ...debugTapTimestampsRef.current.filter((timestamp) => now - timestamp < 1200),
      now,
    ]

    debugTapTimestampsRef.current = nextTimestamps

    if (nextTimestamps.length >= 3) {
      debugTapTimestampsRef.current = []
      setDebugErrorMessage('')
      setIsDebugPanelOpen(true)
    }
  }, [])

  const handleDeletePlayer = useCallback(async () => {
    if (isDeletingPlayer) {
      return
    }

    setIsDeletingPlayer(true)
    setDebugErrorMessage('')

    try {
      await deleteCurrentPlayer(authToken)
      resetAnonymousId()
      window.location.reload()
    } catch (error) {
      setDebugErrorMessage(error?.message || 'Не удалось удалить игрока')
      setIsDeletingPlayer(false)
    }
  }, [authToken, isDeletingPlayer])

  useEffect(() => {
    if (serverGame.session?.status !== 'active') {
      finishRequestedRef.current = false
      return
    }

    if (
      serverGame.session.foundSneakerNumbers.length >= TOTAL_SNEAKER_COUNT
      && !finishRequestedRef.current
    ) {
      finishRequestedRef.current = true
      void serverGame.finishSession().finally(() => {
        finishRequestedRef.current = false
      })
    }
  }, [serverGame.finishSession, serverGame.session])

  const handleRestart = useCallback(() => {
    void serverGame.startSession()
  }, [serverGame.startSession])

  const showReturningLoadingHint = loadingMode === 'returning'
    && !onSceneReadyChange
    && (!isSceneReady || (!serverGame.session && serverGame.requestState === 'loading'))

  return (
    <RootTag className={rootClassName}>
      <section className={sectionClassName}>
        {renderCanvas ? <FixedGameMapBackground /> : null}

        {renderCanvas && serverGame.session ? (
          <DraggableGameMapCanvas
            key={sceneKey}
            texturePath="/assets/map-full.webp"
            sceneObjects={gamePropObjects}
            onSneakerCollect={gameplayUi.handleSneakerCollect}
            collectedSneakerNumbers={serverGame.session.foundSneakerNumbers}
            canCollect={serverGame.session.canCollect}
            sceneMode="gameplay"
            onReady={() => setIsSceneReady(true)}
            fadeOnReady={loadingMode !== 'returning' && !onSceneReadyChange}
            className={isSceneReady ? 'opacity-100' : 'opacity-0'}
          />
        ) : null}

        <GamePlayOverlay
          player={player}
          isAboutOpen={gameplayUi.isAboutOpen}
          isSneakersOpen={gameplayUi.isSneakersOpen}
          foundSneakerNumbers={gameplayUi.foundSneakerNumbers}
          flySneaker={gameplayUi.flySneaker}
          sneakersPanelRef={gameplayUi.sneakersPanelRef}
          remainingSeconds={serverGame.displayRemainingSeconds}
          requestError={serverGame.error}
          onOpenAbout={gameplayUi.openAbout}
          onOpenSneakers={gameplayUi.openSneakers}
          onCloseAbout={gameplayUi.closeAbout}
          onCloseSneakers={gameplayUi.closeSneakers}
          onTimerTap={handleTimerTap}
          isDebugPanelOpen={isDebugPanelOpen}
          isDeletingPlayer={isDeletingPlayer}
          debugErrorMessage={debugErrorMessage}
          onDeletePlayer={handleDeletePlayer}
          onCloseDebugPanel={() => setIsDebugPanelOpen(false)}
        />

        {showReturningLoadingHint ? (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-40 flex justify-center px-4 pt-6">
            <div className="rounded-full border border-[#d9fcab]/60 bg-black/35 px-4 py-2 font-display text-[14px] leading-none text-[#d9fcab] backdrop-blur-sm">
              Открываем игру...
            </div>
          </div>
        ) : null}

        {!showReturningLoadingHint && serverGame.requestState === 'loading' && !serverGame.session ? (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-40 flex justify-center px-4 pt-6">
            <div className="rounded-full border border-[#d9fcab]/60 bg-black/35 px-4 py-2 font-display text-[14px] leading-none text-[#d9fcab] backdrop-blur-sm">
              Подключаем игру...
            </div>
          </div>
        ) : null}

        {serverGame.lifecycle === 'expired' ? (
          <SessionResultOverlay
            title="Время вышло"
            body="Попытка завершилась, а прогресс этой сессии не сохранился. Можно начать новый поиск."
            actionLabel="Начать заново"
            onAction={handleRestart}
          />
        ) : null}

        {serverGame.lifecycle === 'finished' ? (
          <SessionResultOverlay
            title="Коллекция собрана"
            body="Все пары найдены вовремя. Эта попытка зафиксирована, а вы можете запустить новый раунд."
            actionLabel="Играть снова"
            onAction={handleRestart}
          />
        ) : null}
      </section>
    </RootTag>
  )
}

const slides = [
  {
    id: 'alert',
    badge: 'Внимание!',
    art: <SneakerArt />,
    body: (
      <div className="w-full text-center text-[16px] font-normal leading-normal text-white">
        <p>
          Пропали 10 пар новеньких кроссовок Adidas.
        </p>
        <p className="mt-6">
          Свидетелей нет, вся надежда только на вас. Исследуйте локации на карте,
          соберите все 10 пар и участвуйте в розыгрыше 10 сертификатов на Lamoda
          на 10 000 рублей.
        </p>
      </div>
    ),
    actions: [
      {
        label: 'Я в деле',
        variant: 'intro',
        next: 1,
      },
    ],
  },
  {
    id: 'subscribe',
    art: <LamodaArt />,
    body: (
      <div className="space-y-6 text-center text-[24px] leading-[0.98] font-normal text-white">
        <p>
          Прежде чем начать
          <br />
          расследование, проверьте,
          <br />
          есть ли у вас подписка
          <br />
          на канал Lamoda.
        </p>
        <p>
          Тренды, новинки сезона
          <br />
          и обзоры появляются
          <br />
          там раньше всех.
        </p>
      </div>
    ),
    actions: [
      {
        label: 'Проверить подписку',
        variant: 'dark',
        kind: 'check-subscription',
      },
      {
        label: 'Подписаться',
        variant: 'lime',
        kind: 'open-channel',
      },
    ],
  },
  {
    id: 'retry',
    art: <SearchArt />,
    body: (
      <div className="space-y-6 text-center text-[24px] leading-[0.98] font-normal text-white">
        <p>
          Упс. Подписку не видно
          <br />
          также, как пропавшие
          <br />
          кроссовки Adidas.
        </p>
        <p>
          Попробуйте ещё раз
          <br />
          и приступайте к поиску.
        </p>
      </div>
    ),
    actions: [
      {
        label: 'Проверить подписку',
        variant: 'dark',
        kind: 'check-subscription',
      },
      {
        label: 'Подписаться',
        variant: 'lime',
        kind: 'open-channel',
      },
    ],
  },
]

function App() {
  const backendBootstrap = useBackendBootstrap()
  const [activeIndex, setActiveIndex] = useState(0)
  const [subscriptionChannelUrl, setSubscriptionChannelUrl] = useState(defaultChannelUrl)
  const [isCheckingSubscription, setIsCheckingSubscription] = useState(false)
  const [isSubscriptionConfirmed, setIsSubscriptionConfirmed] = useState(false)
  const slide = typeof activeIndex === 'number' ? slides[activeIndex] : null
  const isAlertSlide = slide?.id === 'alert'

  useEffect(() => {
    logGameDebug('app:state-snapshot', {
      activeIndex,
      slideId: slide?.id ?? null,
      introOnly: true,
      authStatus: backendBootstrap.status,
      playerId: backendBootstrap.player?.id ?? null,
    })
  }, [activeIndex, backendBootstrap.player?.id, backendBootstrap.status, slide?.id])

  useEffect(() => {
    const webApp = getTelegramWebApp()
    const initData = webApp?.initData?.trim() ?? null

    console.log('Telegram initData on app intro:', initData)
    console.log('Telegram initDataUnsafe on app intro:', webApp?.initDataUnsafe ?? null)
  }, [])

  useEffect(() => {
    if (backendBootstrap.player?.subscribedToChannel) {
      setIsSubscriptionConfirmed(true)
    }
  }, [backendBootstrap.player?.subscribedToChannel])

  useEffect(() => {
    if (backendBootstrap.status !== 'error') {
      return
    }

    logGameDebug('app:auth-bootstrap-error', {
      message: backendBootstrap.error?.message ?? 'unknown error',
      status: backendBootstrap.error?.status ?? null,
    })
  }, [backendBootstrap.error, backendBootstrap.status])

  const navigateTo = useCallback((nextIndex) => {
    if (typeof nextIndex !== 'number') {
      logGameDebug('app:intro-navigation-blocked', {
        from: activeIndex,
        to: nextIndex ?? null,
      })
      return
    }

    logGameDebug('app:navigate', {
      from: activeIndex,
      to: nextIndex,
    })
    setActiveIndex(nextIndex)
  }, [activeIndex])

  const handleSubscriptionCheck = useCallback(async () => {
    if (isCheckingSubscription) {
      return
    }

    setIsCheckingSubscription(true)

    try {
      const result = await checkSubscriptionStatus()

      if (result?.channelUrl) {
        setSubscriptionChannelUrl(result.channelUrl)
      }

      if (result?.subscribed) {
        setIsSubscriptionConfirmed(true)
        logGameDebug('app:subscription-confirmed', {
          memberStatus: result?.memberStatus ?? null,
          available: result?.available ?? true,
        })
        return
      }

      setIsSubscriptionConfirmed(false)
      navigateTo(2)
    } catch (error) {
      setIsSubscriptionConfirmed(false)
      logGameDebug('app:subscription-check-failed', {
        message: error?.message ?? 'unknown error',
        status: error?.status ?? null,
      })
      navigateTo(2)
    } finally {
      setIsCheckingSubscription(false)
    }
  }, [isCheckingSubscription, navigateTo])

  return (
    <main className="relative min-h-svh overflow-hidden bg-[#3d5064] text-white">
      <HiddenMapWarmupImage />
      {typeof activeIndex === 'number' ? (
        <section className="relative z-40 flex w-full flex-col items-center">
        <article
          key={slide.id}
          className="screen-grain relative flex h-svh w-full flex-col overflow-hidden rounded-none bg-[#3d5064] px-6 sm:px-8 md:justify-center md:gap-8"
          style={{
            paddingTop: TG_SAFE_UI_TOP,
            paddingBottom: `calc(${TG_SAFE_CONTENT_BOTTOM} + 2rem)`,
          }}
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 h-[134px] bg-[linear-gradient(180deg,_#000000_0%,_rgba(0,0,0,0)_100%)]" />

          {slide.badge && !isAlertSlide ? (
            <div className="intro-grid-item intro-grid-item-1 relative flex w-full justify-center">
              <span
                data-text={slide.badge}
                className="attention-badge font-display text-center text-[36px] font-normal leading-normal tracking-normal text-white"
              >
                {slide.badge}
              </span>
            </div>
          ) : null}

          <div
            className="relative flex flex-1 w-full items-center justify-center md:flex-none"
          >
            <div
              className={`relative flex w-full flex-col items-center justify-center ${
                isAlertSlide ? 'gap-8' : 'gap-6'
              }`}
            >
              {slide.badge && isAlertSlide ? (
                <div className="intro-grid-item intro-grid-item-1 relative flex w-full justify-center">
                  <span
                    data-text={slide.badge}
                    className="attention-badge font-display text-center text-[36px] font-normal leading-normal tracking-normal text-white"
                  >
                    {slide.badge}
                  </span>
                </div>
              ) : null}

              <div
                className={`intro-grid-item ${isAlertSlide ? 'intro-grid-item-2' : 'intro-grid-item-1'} relative flex w-full items-center justify-center`}
              >
                {slide.art}
              </div>

              <div
                className={`intro-grid-item ${isAlertSlide ? 'intro-grid-item-3' : 'intro-grid-item-2'} relative flex w-full justify-center text-center ${
                  isAlertSlide ? 'max-w-sm self-center -mt-5 md:-mt-8' : 'pt-[clamp(0.75rem,4vh,2rem)]'
                }`}
              >
                {slide.body}
              </div>
            </div>
          </div>

          <div
            className={`intro-grid-item ${isAlertSlide ? 'intro-grid-item-4' : 'intro-grid-item-3'} relative mt-auto h-[106px] md:mt-0 md:h-auto ${
              isAlertSlide
                ? 'grid w-full grid-rows-[47px_47px] content-end gap-y-3 px-2 md:content-start'
                : 'grid w-full content-end gap-y-3 px-2 md:content-start'
            }`}
          >
            {slide.actions.map((action) => {
              if (action.variant === 'intro') {
                return (
                  <RibbonButton
                    key={action.label}
                    label={action.label}
                    onClick={() => navigateTo(action.next)}
                  />
                )
              }

              if (action.variant === 'dark') {
                const isSubscriptionAction = action.kind === 'check-subscription'
                const buttonLabel = isSubscriptionAction
                  ? (isCheckingSubscription
                      ? 'Проверяем...'
                      : (isSubscriptionConfirmed ? 'Подписка найдена' : action.label))
                  : action.label

                return (
                  <button
                    key={action.label}
                    type="button"
                    className="pixel-button-svg"
                    disabled={isCheckingSubscription}
                    onClick={() => {
                      if (isSubscriptionAction) {
                        void handleSubscriptionCheck()
                        return
                      }

                      navigateTo(action.next)
                    }}
                  >
                    <ButtonSvg
                      width="100%"
                      className="absolute inset-0 h-full w-full"
                    />
                    <span className="button-text-dark relative z-10">
                      {buttonLabel}
                    </span>
                  </button>
                )
              }

              if (action.kind === 'open-channel') {
                return (
                  <a
                    key={action.label}
                    href={subscriptionChannelUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="pixel-button-svg-light"
                  >
                    <ButtonSvgLight width="100%" className="absolute inset-0 h-full w-full" />
                    <span className="button-text-light relative z-10">
                      {action.label}
                    </span>
                  </a>
                )
              }

              return (
                <button
                  key={action.label}
                  type="button"
                  className="pixel-button"
                  onClick={() => navigateTo(action.next)}
                >
                  {action.label}
                </button>
              )
            })}
            {isAlertSlide ? <div aria-hidden="true" /> : null}
          </div>
        </article>
        </section>
      ) : null}
    </main>
  )
}

export default App
