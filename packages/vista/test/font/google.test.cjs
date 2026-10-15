#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { describe, it, beforeEach } = require('node:test');

const googlePath = path.join(__dirname, '../../dist/font/google.js');
const registryPath = path.join(__dirname, '../../dist/font/registry.js');

const { Inter } = require(googlePath);
const { clearRegistry, getRegisteredFonts } = require(registryPath);

function googleUrl(options) {
  clearRegistry();
  Inter(options);
  return getRegisteredFonts()[0].googleUrl;
}

describe('google font URL generation', () => {
  beforeEach(() => clearRegistry());

  it('requests the italic axis when only italic style is selected', () => {
    const url = googleUrl({ style: 'italic', weight: ['400', 700] });
    // The CSS2 API requires the `ital` axis whenever italic is requested.
    assert.match(url, /family=Inter%3Aital%2Cwght%401%2C400%3B1%2C700/);
    assert.doesNotMatch(url, /family=Inter%3Awght/);
  });

  it('requests the italic axis for a single italic weight', () => {
    const url = googleUrl({ style: 'italic' });
    assert.match(url, /family=Inter%3Aital%2Cwght%401%2C400/);
  });

  it('omits the italic axis when only normal style is selected', () => {
    const url = googleUrl({ weight: ['400', '700'] });
    assert.match(url, /family=Inter%3Awght%40400%3B700/);
    assert.doesNotMatch(url, /ital/);
  });

  it('emits normal and italic tuples when both styles are selected', () => {
    const url = googleUrl({ style: ['normal', 'italic'], weight: ['400', '700'] });
    assert.match(url, /family=Inter%3Aital%2Cwght%400%2C400%3B0%2C700%3B1%2C400%3B1%2C700/);
  });
});
