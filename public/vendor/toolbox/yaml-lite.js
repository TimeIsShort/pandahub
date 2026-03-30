/* Lightweight YAML utility for toolbox common scenarios. */
(function attachYamlLite(global) {
  'use strict';

  function isPlainObject(value) {
    return Object.prototype.toString.call(value) === '[object Object]';
  }

  function escapeString(value) {
    if (value === '') {
      return "''";
    }
    if (/^[A-Za-z0-9._/-]+$/.test(value)) {
      return value;
    }
    return JSON.stringify(value);
  }

  function scalarToYaml(value) {
    if (value === null) return 'null';
    if (value === true) return 'true';
    if (value === false) return 'false';
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
    return escapeString(String(value));
  }

  function stringify(value, options) {
    var indent = Math.max(2, Number(options && options.indent) || 2);
    return renderNode(value, 0, indent).trimEnd() + '\n';
  }

  function renderNode(value, level, indent) {
    var pad = ' '.repeat(level * indent);
    if (Array.isArray(value)) {
      if (value.length === 0) return pad + '[]\n';
      var lines = [];
      for (var i = 0; i < value.length; i += 1) {
        var item = value[i];
        if (isPlainObject(item) || Array.isArray(item)) {
          lines.push(pad + '-\n' + renderNode(item, level + 1, indent));
        } else {
          lines.push(pad + '- ' + scalarToYaml(item) + '\n');
        }
      }
      return lines.join('');
    }

    if (isPlainObject(value)) {
      var keys = Object.keys(value);
      if (keys.length === 0) return pad + '{}\n';
      var out = '';
      for (var j = 0; j < keys.length; j += 1) {
        var key = keys[j];
        var node = value[key];
        if (isPlainObject(node) || Array.isArray(node)) {
          out += pad + key + ':\n' + renderNode(node, level + 1, indent);
        } else {
          out += pad + key + ': ' + scalarToYaml(node) + '\n';
        }
      }
      return out;
    }

    return pad + scalarToYaml(value) + '\n';
  }

  function parse(yamlText) {
    if (typeof yamlText !== 'string') {
      throw new Error('YAML 输入必须是字符串');
    }

    var lines = yamlText.replace(/\r\n?/g, '\n').split('\n');
    var cleaned = [];

    for (var i = 0; i < lines.length; i += 1) {
      var line = lines[i];
      if (!line.trim() || line.trim().startsWith('#')) continue;
      cleaned.push(line);
    }

    if (cleaned.length === 0) {
      return null;
    }

    var root = { type: 'object', value: {}, indent: -1 };
    var stack = [root];

    for (var idx = 0; idx < cleaned.length; idx += 1) {
      var raw = cleaned[idx];
      var indentCount = raw.match(/^ */)[0].length;
      var content = raw.trim();

      while (stack.length > 1 && indentCount <= stack[stack.length - 1].indent) {
        stack.pop();
      }

      var parent = stack[stack.length - 1];

      if (content.startsWith('- ')) {
        if (parent.type !== 'array') {
          if (parent.type === 'pending') {
            parent.type = 'array';
            parent.value = [];
          } else {
            throw new Error('YAML 结构不支持：数组层级错误（第 ' + (idx + 1) + ' 行）');
          }
        }

        var itemText = content.slice(2).trim();
        if (!itemText) {
          var nestedObj = { type: 'object', value: {}, indent: indentCount };
          parent.value.push(nestedObj.value);
          stack.push(nestedObj);
          continue;
        }

        if (itemText.includes(':')) {
          var inlineKV = itemText.split(/:(.+)/);
          var obj = {};
          obj[inlineKV[0].trim()] = parseScalar(inlineKV[1].trim());
          parent.value.push(obj);
          stack.push({ type: 'object', value: obj, indent: indentCount });
        } else {
          parent.value.push(parseScalar(itemText));
        }
        continue;
      }

      var parts = content.split(/:(.+)/);
      if (parts.length < 2) {
        throw new Error('YAML 语法不支持（第 ' + (idx + 1) + ' 行）');
      }

      var key = parts[0].trim();
      var rest = (parts[1] || '').trim();

      if (parent.type === 'pending') {
        parent.type = 'object';
        parent.value = {};
      }
      if (parent.type !== 'object') {
        throw new Error('YAML 结构不支持：对象层级错误（第 ' + (idx + 1) + ' 行）');
      }

      if (!rest) {
        var nextLine = cleaned[idx + 1] || '';
        var nextTrim = nextLine.trim();
        var nextIsArray = nextTrim.startsWith('- ');
        if (nextIsArray) {
          parent.value[key] = [];
          stack.push({ type: 'array', value: parent.value[key], indent: indentCount });
        } else {
          parent.value[key] = {};
          stack.push({ type: 'object', value: parent.value[key], indent: indentCount });
        }
      } else {
        parent.value[key] = parseScalar(rest);
      }
    }

    return root.value;
  }

  function parseScalar(text) {
    if (text === 'null' || text === '~') return null;
    if (text === 'true') return true;
    if (text === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);

    if (
      (text.startsWith('"') && text.endsWith('"')) ||
      (text.startsWith("'") && text.endsWith("'"))
    ) {
      var raw = text.slice(1, -1);
      return text.startsWith('"') ? raw.replace(/\\"/g, '"') : raw.replace(/\\'/g, "'");
    }
    return text;
  }

  global.YamlLite = {
    stringify: stringify,
    parse: parse
  };
})(window);
