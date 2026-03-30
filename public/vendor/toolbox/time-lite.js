/* Lightweight time formatter utility for toolbox. */
(function attachTimeLite(global) {
  'use strict';

  function formatInTimeZone(value, timeZone) {
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new Error('无效时间');
    }

    var formatter = new Intl.DateTimeFormat('zh-CN', {
      timeZone: timeZone || 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

    return formatter.format(date).replace(/\//g, '-');
  }

  function fromTimestamp(input) {
    var raw = String(input).trim();
    if (!raw) throw new Error('请输入时间戳');
    if (!/^-?\d+$/.test(raw)) throw new Error('时间戳必须是整数');
    var numeric = Number(raw);
    if (!Number.isFinite(numeric)) throw new Error('时间戳超出范围');
    var ms = Math.abs(numeric) < 1e12 ? numeric * 1000 : numeric;
    var date = new Date(ms);
    if (Number.isNaN(date.getTime())) throw new Error('时间戳无效');
    return {
      ms: ms,
      sec: Math.floor(ms / 1000),
      iso: date.toISOString()
    };
  }

  function toTimestamp(input) {
    var raw = String(input).trim();
    if (!raw) throw new Error('请输入日期时间');
    var date = new Date(raw);
    if (Number.isNaN(date.getTime())) throw new Error('日期格式无效');
    var ms = date.getTime();
    return {
      ms: ms,
      sec: Math.floor(ms / 1000),
      iso: date.toISOString()
    };
  }

  global.TimeLite = {
    formatInTimeZone: formatInTimeZone,
    fromTimestamp: fromTimestamp,
    toTimestamp: toTimestamp
  };
})(window);
