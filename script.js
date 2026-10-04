// ==UserScript==
// @name         B站搜索过滤
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  在B站任意搜索页面，删除标题与当前搜索关键词无关的视频卡片
// @author       ZhangJC
// @match        *://search.bilibili.com/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    // 是否过滤影视/番剧卡片
    const FILTER_MEDIA_CARDS = true;
    // 是否删除广告卡片
    const FILTER_ADS = true;
    // 匹配阈值：标题中至少包含多少个分词才算相关（1 = 包含任意一个分词即可）
    const MIN_MATCH_COUNT = 1;
    // 是否忽略大小写（建议开启）
    const IGNORE_CASE = true;

    /**
     * 获取当前搜索关键词
     */
    function getSearchKeyword() {
        const url = new URL(location.href);
        let keyword = url.searchParams.get('keyword') || url.searchParams.get('q') || '';

        if (!keyword) {
            const input = document.querySelector(
                '.search-input-el, input[name="keyword"], input[type="text"]'
            );
            if (input && input.value) {
                keyword = input.value;
            }
        }

        return decodeURIComponent(keyword).trim();
    }

    /**
     * 按空格分隔关键词
     */
    function splitKeyword(keyword) {
        if (!keyword) return [];

        // 按空格（包括全角空格）分隔，过滤空字符串
        const segments = keyword
            .split(/[\s\u3000]+/)
            .map((s) => s.trim())
            .filter(Boolean);

        return segments;
    }

    /**
     * 判断标题是否与关键词相关
     * @param {string} title - 标题文本
     * @param {string[]} segments - 分词列表
     * @returns {boolean}
     */
    function titleMatches(title, segments) {
        if (!segments || segments.length === 0) return true;

        // 归一化：可选忽略大小写、去空格
        const normalize = (s) => {
            let result = s.replace(/\s+/g, '');
            if (IGNORE_CASE) result = result.toLowerCase();
            return result;
        };

        const normalizedTitle = normalize(title);

        let matchCount = 0;
        for (const seg of segments) {
            const normalizedSeg = normalize(seg);
            if (normalizedSeg && normalizedTitle.includes(normalizedSeg)) {
                matchCount++;
                if (matchCount >= MIN_MATCH_COUNT) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * 判断视频卡片是否保留
     */
    function shouldKeepVideoCard(card, segments) {
        // 广告处理
        if (FILTER_ADS) {
            if (
                card.closest('[class*="ad"]') ||
                card.querySelector('.bili-video-card__stats--ad') ||
                card.querySelector('.ad-feedback-entry') ||
                card.closest('.brand-ad-list')
            ) {
                return false;
            }
        }

        const titleEl = card.querySelector('.bili-video-card__info--tit');
        if (!titleEl) return true;

        return titleMatches(titleEl.textContent.trim(), segments);
    }

    /**
     * 判断影视/番剧卡片是否保留
     */
    function shouldKeepMediaCard(card, segments) {
        if (!FILTER_MEDIA_CARDS) return true;

        let titleEl = card.querySelector('.media-card-content-head-title a');
        if (!titleEl) {
            titleEl = card.querySelector('.text_ellipsis');
        }
        if (!titleEl) return true;

        return titleMatches(titleEl.textContent.trim(), segments);
    }

    /**
     * 删除卡片
     */
    function removeCard(card) {
        const column = card.closest('[class*="col_"]');
        if (column) {
            column.remove();
        } else {
            card.remove();
        }
    }

    /**
     * 执行过滤
     */
    function filterAll() {
        const keyword = getSearchKeyword();
        if (!keyword) return;

        const segments = splitKeyword(keyword);
        if (segments.length === 0) return;

        // 视频卡片
        document.querySelectorAll('.bili-video-card').forEach((card) => {
            if (!shouldKeepVideoCard(card, segments)) {
                removeCard(card);
            }
        });

        // 影视/番剧卡片
        if (FILTER_MEDIA_CARDS) {
            document.querySelectorAll('.media-card').forEach((card) => {
                if (!shouldKeepMediaCard(card, segments)) {
                    removeCard(card);
                }
            });
            document.querySelectorAll('.bangumi-pgc-list .media-item').forEach((item) => {
                const card = item.querySelector('.media-card');
                if (card && !shouldKeepMediaCard(card, segments)) {
                    removeCard(item);
                }
            });
        }
    }

    // 初始执行
    filterAll();

    // 防抖
    let filterTimer = null;
    function scheduleFilter(delay = 100) {
        clearTimeout(filterTimer);
        filterTimer = setTimeout(filterAll, delay);
    }

    // 动态监听
    const observer = new MutationObserver((mutations) => {
        let shouldFilter = false;
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    if (
                        node.classList?.contains('bili-video-card') ||
                        node.classList?.contains('media-card') ||
                        node.querySelector?.('.bili-video-card, .media-card')
                    ) {
                        shouldFilter = true;
                        break;
                    }
                }
            }
            if (shouldFilter) break;
        }
        if (shouldFilter) {
            scheduleFilter(100);
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });

    // URL 变化监听
    let lastUrl = location.href;
    new MutationObserver(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            scheduleFilter(500);
        }
    }).observe(document, { subtree: true, childList: true });

    // 搜索按钮 / 回车
    document.addEventListener(
        'click',
        (e) => {
            if (
                e.target.classList?.contains('search-button') ||
                e.target.closest('.search-button')
            ) {
                scheduleFilter(1000);
            }
        },
        true
    );

    document.addEventListener(
        'keydown',
        (e) => {
            if (
                e.key === 'Enter' &&
                e.target.matches?.('.search-input-el, input[type="text"]')
            ) {
                scheduleFilter(1000);
            }
        },
        true
    );

})();
