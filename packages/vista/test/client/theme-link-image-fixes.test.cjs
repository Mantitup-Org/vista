'use strict';

const Module = require('module');
const origRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === 'react') {
    class MockComponent {}
    return {
      Component: MockComponent,
      PureComponent: MockComponent,
      forwardRef: (fn) => fn,
      useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
      useEffect: () => {},
      useCallback: (fn) => fn,
      useMemo: (fn) => fn(),
      useContext: () => null,
      useRef: (init) => ({ current: init }),
      createContext: () => ({ Provider: () => null }),
    };
  }
  if (id === 'react/jsx-runtime') {
    return {
      jsx: (type, props) => ({ type, props }),
      jsxs: (type, props) => ({ type, props }),
    };
  }
  return origRequire.apply(this, arguments);
};

const test = require('node:test');
const assert = require('node:assert/strict');

// 1. Tests for Issue #110 (Image and getImgProps)
const { getImgProps, getImageProps } = require('../../dist/image/get-img-props');
const imageIndex = require('../../dist/image/index');
const imageServer = require('../../dist/image/react-server');

test('getImgProps defaults defaultLoader without throwing TypeError (Issue #110)', () => {
  const result = getImgProps({
    src: '/hero.png',
    alt: 'Hero banner',
    width: 640,
    height: 480,
  });

  assert.ok(result);
  assert.equal(result.alt, 'Hero banner');
  assert.equal(result.width, 640);
  assert.equal(result.height, 480);
  assert.equal(result.src, '/_vista/image?url=%2Fhero.png&w=640&q=75');
  assert.ok(result.srcSet && result.srcSet.includes('/_vista/image?url=%2Fhero.png'));
});

test('getImgProps and getImageProps alias are exported from image entrypoints (Issue #110)', () => {
  assert.equal(typeof getImageProps, 'function');
  assert.equal(typeof imageIndex.getImgProps, 'function');
  assert.equal(typeof imageIndex.getImageProps, 'function');
  assert.equal(typeof imageServer.getImgProps, 'function');
  assert.equal(typeof imageServer.getImageProps, 'function');
});

test('getImgProps preserves raw src for unoptimized/svg/data images (Issue #110)', () => {
  const svgResult = getImgProps({
    src: '/logo.svg',
    alt: 'Logo',
    width: 100,
    height: 100,
  });
  assert.equal(svgResult.src, '/logo.svg');
  assert.equal(svgResult.srcSet, undefined);

  const unoptimizedResult = getImgProps({
    src: '/photo.jpg',
    alt: 'Photo',
    width: 800,
    height: 600,
    unoptimized: true,
  });
  assert.equal(unoptimizedResult.src, '/photo.jpg');
  assert.equal(unoptimizedResult.srcSet, undefined);
});

// 2. Tests for Issue #103 (Link active states, download, target)
const { Link, useIsActive } = require('../../dist/client/link');

test('useIsActive matches routes with query parameters and hash fragments (Issue #103)', () => {
  global.window = {
    location: {
      pathname: '/dashboard',
    },
  };

  assert.equal(useIsActive('/dashboard?tab=analytics'), true);
  assert.equal(useIsActive('/dashboard#settings'), true);
  assert.equal(useIsActive('/dashboard?tab=billing&view=cards#details'), true);
  assert.equal(useIsActive('/settings'), false);
});

test('Link click handler bypasses preventDefault for download and external targets (Issue #103)', () => {
  global.window = {
    location: {
      origin: 'https://example.com',
      pathname: '/docs',
    },
  };

  const createEvent = () => {
    let prevented = false;
    return {
      button: 0,
      defaultPrevented: false,
      preventDefault: () => {
        prevented = true;
      },
      isPrevented: () => prevented,
    };
  };

  // Test Link element render with download prop
  const linkWithDownload = Link({
    href: '/files/report.pdf',
    download: 'report.pdf',
    children: 'Download',
  });
  const e1 = createEvent();
  linkWithDownload.props.onClick(e1);
  assert.equal(e1.isPrevented(), false, 'Download link must not be intercepted');

  // Test Link with target="_top"
  const linkTopTarget = Link({
    href: '/embedded',
    target: '_top',
    children: 'Top',
  });
  const e2 = createEvent();
  linkTopTarget.props.onClick(e2);
  assert.equal(e2.isPrevented(), false, 'target="_top" must not be intercepted');

  // Test Link with target="_parent"
  const linkParentTarget = Link({
    href: '/embedded',
    target: '_parent',
    children: 'Parent',
  });
  const e3 = createEvent();
  linkParentTarget.props.onClick(e3);
  assert.equal(e3.isPrevented(), false, 'target="_parent" must not be intercepted');

  // Test Link with target="_blank"
  const linkBlankTarget = Link({
    href: '/external',
    target: '_blank',
    children: 'Blank',
  });
  const e4 = createEvent();
  linkBlankTarget.props.onClick(e4);
  assert.equal(e4.isPrevented(), false, 'target="_blank" must not be intercepted');

  // Test same-page hash link
  const linkSamePageHash = Link({
    href: '/docs#faq',
    children: 'FAQ',
  });
  const e5 = createEvent();
  linkSamePageHash.props.onClick(e5);
  assert.equal(e5.isPrevented(), false, 'Same-page hash link must not be intercepted');
});

// 3. Tests for Issue #135 (Theme reactivity)
const { applyTheme } = require('../../dist/theme/theme-provider');

test('applyTheme applies resolvedTheme to document root classes and style (Issue #135)', () => {
  const mockClassList = new Set();
  const mockRoot = {
    classList: {
      remove: (...cls) => cls.forEach((c) => mockClassList.delete(c)),
      add: (...cls) => cls.forEach((c) => mockClassList.add(c)),
    },
    dataset: {},
    style: {},
  };

  global.document = {
    documentElement: mockRoot,
  };

  applyTheme('dark');
  assert.ok(mockClassList.has('dark'));
  assert.equal(mockRoot.dataset.theme, 'dark');
  assert.equal(mockRoot.style.colorScheme, 'dark');

  applyTheme('light');
  assert.ok(mockClassList.has('light'));
  assert.ok(!mockClassList.has('dark'));
  assert.equal(mockRoot.dataset.theme, 'light');
  assert.equal(mockRoot.style.colorScheme, 'light');
});
