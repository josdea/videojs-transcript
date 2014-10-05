/*! videojs-transcript - v0.0.0 - 2014-10-05
* Copyright (c) 2014 Matthew Walsh; Licensed MIT */
(function (window, videojs) {
  'use strict';


// requestAnimationFrame polyfill by Erik Möller. fixes from Paul Irish and Tino Zijdel
// MIT license
// https://gist.github.com/paulirish/1579671
(function() {
  var lastTime = 0;
  var vendors = ['ms', 'moz', 'webkit', 'o'];
  for(var x = 0; x < vendors.length && !window.requestAnimationFrame; ++x) {
    window.requestAnimationFrame = window[vendors[x]+'RequestAnimationFrame'];
    window.cancelAnimationFrame = window[vendors[x]+'CancelAnimationFrame']
    || window[vendors[x]+'CancelRequestAnimationFrame'];
  }
  if (!window.requestAnimationFrame)
    window.requestAnimationFrame = function(callback, element) {
      var currTime = new Date().getTime();
      var timeToCall = Math.max(0, 16 - (currTime - lastTime));
      var id = window.setTimeout(function() { callback(currTime + timeToCall); },
      timeToCall);
      lastTime = currTime + timeToCall;
      return id;
    };
  if (!window.cancelAnimationFrame)
    window.cancelAnimationFrame = function(id) {
      clearTimeout(id);
    };
}());

// Object.create() polyfill
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/create#Polyfill
if (typeof Object.create != 'function') {
  Object.create = (function() {
    var Object = function() {};
    return function (prototype) {
      if (arguments.length > 1) {
        throw Error('Second argument not supported');
      }
      if (typeof prototype != 'object') {
        throw TypeError('Argument must be an object');
      }
      Object.prototype = prototype;
      var result = new Object();
      Object.prototype = null;
      return result;
    };
  })();
}

// forEach polyfill
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/forEach#Polyfill
if (!Array.prototype.forEach) {
  Array.prototype.forEach = function(callback, thisArg) {
    var T, k;
    if (this == null) {
      throw new TypeError(' this is null or not defined');
    }
    var O = Object(this);
    var len = O.length >>> 0;
    if (typeof callback != "function") {
      throw new TypeError(callback + ' is not a function');
    }
    if (arguments.length > 1) {
      T = thisArg;
    }
    k = 0;
    while (k < len) {
      var kValue;
      if (k in O) {
        kValue = O[k];
        callback.call(T, kValue, k, O);
      }
      k++;
    }
  };
}

// Global settings
var my = {};
my.settings = {};
my.prefix = 'transcript';
my.player = this;

// Defaults
var defaults = {
  autoscroll: true,
  clickArea: 'line'
};

/*global my*/
var utils = (function (plugin) {
  return {
    secondsToTime: function (timeInSeconds) {
      var hour = Math.floor(timeInSeconds / 3600);
      var min = Math.floor(timeInSeconds % 3600 / 60);
      var sec = Math.floor(timeInSeconds % 60);
      sec = (sec < 10) ? '0' + sec : sec;
      min = (hour > 0 && min < 10) ? '0' + min : min;
      if (hour > 0) {
        return hour + ':' + min + ':' + sec;
      }
      return min + ':' + sec;
    },
    localize: function (string) {
      return string; // TODO: do something here;
    },
    createEl: function (elementName, classSuffix) {
      classSuffix = classSuffix || '';
      var el = document.createElement(elementName);
      el.className = plugin.prefix + classSuffix;
      return el;
    },
    extend: function(obj) {
      var type = typeof obj;
      if (!(type === 'function' || type === 'object' && !!obj)) {
        return obj;
      }
      var source, prop;
      for (var i = 1, length = arguments.length; i < length; i++) {
        source = arguments[i];
        for (prop in source) {
          obj[prop] = source[prop];
        }
      }
      return obj;
    }
  };
}(my));

var eventEmitter = {
  handlers_: [],
  on: function on (object, eventtype, callback) {
    if (typeof callback === 'function') {
      this.handlers_.push([object, eventtype, callback]);
    } else {
      throw new TypeError('Callback is not a function.');
    }
  },
  trigger: function trigger (object, eventtype) {
    this.handlers_.forEach( function(h) {
      if (h[0] === object &&
          h[1] === eventtype) {
            h[2].apply();
      }
    });
  },
  delegate: function (obj) {
    obj.on = function (event, callback) {
      eventEmitter.on(obj, event, callback);
    };
    obj.trigger = function (obj) {
      eventEmitter.trigget(obj, event);
    };
    return obj;
  }
};

/*global my, utils*/
var scrollable = function (plugin) {
'use strict';
  var scrollablePrototype = {
    easeOut: function (time, start, change, duration) {
      return start + change * Math.sin(Math.min(1, time / duration) * (Math.PI / 2));
    },

    // Animate the scrolling.
    scrollTo: function (element, newPos, duration) {
      var startTime = Date.now();
      var startPos = element.scrollTop;

      // Don't try to scroll beyond the limits. You won't get there and this will loop forever.
      newPos = Math.max(0, newPos);
      newPos = Math.min(element.scrollHeight - element.clientHeight, newPos);
      var change = newPos - startPos;

      // This inner function is called until the elements scrollTop reaches newPos.
      var updateScroll = function () {
        var now = Date.now();
        var time = now - startTime;
        this.isAutoScrolling = true;
        element.scrollTop = this.easeOut(time, startPos, change, duration);
        if (element.scrollTop !== newPos) {
          requestAnimationFrame(updateScroll, element);
        }
      };
      requestAnimationFrame(updateScroll, element);
    },
      // Scroll an element's parent so the element is brought into view.
      scrollToElement: function (element) {
        var parent = element.parentElement;
        var parentOffsetBottom = parent.offsetTop + parent.clientHeight;
        var elementOffsetBottom = element.offsetTop + element.clientHeight;
        var relPos = (element.offsetTop + element.clientHeight) - parent.offsetTop;
        var newPos;

        // If the line is above the top of the parent view, were scrolling up,
        // so we want to move the top of the element downwards to match the top of the parent.
        if (relPos < parent.scrollTop) {
          newPos = element.offsetTop - parent.offsetTop;

        // If the line is below the parent view, we're scrolling down, so we want the
        // bottom edge of the line to move up to meet the bottom edge of the parent.
        } else if (relPos > (parent.scrollTop + parent.clientHeight)) {
          newPos = elementOffsetBottom - parentOffsetBottom;
        }

        // Don't try to scroll if we haven't set a new position.  If we didn't
        // set a new position the line is already in view (i.e. It's not above
        // or below the view)
        // And don't try to scroll when the element is already in position.
        if (newPos !== undefined && parent.scrollTop !== newPos) {
          scrollTo(parent, newPos, 400);
        }
      },

      initHandlers: function () {
        var el = this.element;
        // The scroll event. We want to keep track of when the user is scrolling the transcript.
        el.addEventListener('scroll', function () {
          if (this.isAutoScrolling) {

            // If isAutoScrolling was set to true, we can set it to false and then ignore this event.
            this.isAutoScrolling = false; // event handled
          } else {

            // We only care about when the user scrolls. Set userIsScrolling to true and add a nice class.
            this.userIsScrolling = true;
            el.classList.add('is-inuse');
          }
        });

        // The mouseover event.
        el.addEventListener('mouseover', function () {
          this.mouseIsOverTranscript = true;
        });
        el.addEventListener('mouseout', function () {
          this.mouseIsOverTranscript = false;

          // Have a small delay before deciding user as done interacting.
          setTimeout(function () {

            // Make sure the user didn't move the pointer back in.
            if (!this.mouseIsOverTranscript) {
              this.userIsScrolling = false;
              el.classList.remove('is-inuse');
            }
          }, 1000);
        });
      },

      // Return whether the element is scrollable.
      canScroll: function () {
        var el = this.element;
        return el.scrollHeight > el.offsetHeight;
      },

      // Return whether the user is interacting with the transcript.
      inUse: function () {
        return this.userIsScrolling;
      },
      el: function () {
        return this.element;
      },
  };
  //Factory function
  var createScrollable = function (element) {
    var ob = Object.create(scrollablePrototype)
    console.log(ob);
    utils.extend(ob, {
      element: element,
      userIsScrolling : false,
      mouseIsOver: false,
      isAutoScrolling: true,
    });
    console.log(ob);
    return ob;
  };
  return {
    create: createScrollable
  };
}(my);


/*global my*/
var trackList = function (plugin) {
  var activeTrack;
  return {
    get: function () {
      var validTracks = [];
      my.tracks = my.player.textTracks();
      my.tracks.forEach(function (track) {
        if (track.kind() === 'captions' || track.kind() === 'subtitles') {
          validTracks.push(track);
        }
      });
      return validTracks;
    },
    active: function (tracks) {
      tracks.forEach(function (track) {
        if (track.mode() === 2) {
          activeTrack = track;
          return track;
        }
      });
      // fallback to first track
      return activeTrack || tracks[0];
    },
  };
}(my);

/*globals utils, eventEmitter, my, scrollable*/

var widget = function (plugin) {
  var my = {};
  my.element = {};
  my.body = {};
  var on = function (event, callback) {
    eventEmitter.on(this, event, callback);
  };
  var trigger = function (event) {
    eventEmitter.trigger(this, event);
  };
  var createTitle = function () {
    var header = utils.createEl('header', '-header');
    header.textContent = utils.localize('Transcript');
    return header;
  };
  var createSelector = function (){
    var selector = utils.createEl('select', '-selector');
      plugin.validTracks.forEach(function (track, i) {
      var option = document.createElement('option');
      option.value = i;
      option.textContent = track.label() + ' (' + track.language() + ')';
      selector.appendChild(option);
    });
    selector.addEventListener('change', function (e) {
      setTrack(document.querySelector('#' + plugin.prefix + '-' + plugin.player.id() + ' option:checked').value);
      trigger('trackchanged');
    });
    return selector;
  };
  var createLine = function (cue) {
    var line = utils.createEl('div', '-line');
    var timestamp = utils.createEl('span', '-timestamp');
    var text = utils.createEl('span', '-text');
    line.setAttribute('data-begin', cue.startTime);
    timestamp.textContent = utils.secondsToTime(cue.startTime);
    text.innerHTML = cue.text;
    line.appendChild(timestamp);
    line.appendChild(text);
    return line;
  };
  var createTranscriptBody = function (track) {
    if (typeof track !== 'object') {
      track = plugin.player.textTracks()[track];
    }
    var body = utils.createEl('div', '-body');
    var line, i;
    var fragment = document.createDocumentFragment();
    var createTranscript = function () {
      var cues = track.cues();
      for (i = 0; i < cues.length; i++) {
        line = createLine(cues[i]);
        fragment.appendChild(line);
      }
      body.innerHTML = '';
      body.appendChild(fragment);
      body.setAttribute('lang', track.language());
    };
    if (track.readyState() !==2) {
      track.load();
      track.on('loaded', createTranscript);
    } else {
      createTranscript();
    }
    return body;
  };
  var create = function () {
    var el = document.createElement('div');
    my.element = el;
    el.setAttribute('id', plugin.prefix + '-' + plugin.player.id());
    var title = createTitle();
    el.appendChild(title);
    var selector = createSelector();
    el.appendChild(selector);
    my.body = utils.createEl('div', '-body');
    el.appendChild(my.body);
    setTrack(plugin.currentTrack);
    return this;
  };
  var setTrack = function (track) {
    var newBody = createTranscriptBody(track);
    my.element.insertBefore(newBody, my.body);
    my.element.removeChild(my.body);
    my.body = newBody;
  };
  var setCue = function () {
  //need to implement
  };
  var el = function () {
    return my.element;
  };
  return {
    create: create,
    setTrack: setTrack,
    setCue: setCue,
    el : el,
    on: on,
    trigger: trigger,
  };

}(my);

var transcript = function (options) {
  my.player = this;
  my.validTracks = trackList.get();
  my.currentTrack = trackList.active(my.validTracks);
  my.settings = videojs.util.mergeOptions(defaults, options);
  my.widget = widget.create();
  var timeUpdate = function () {
    my.widget.setCue(my.player.currentTime());
  };
  var updateTrack = function () {
    my.currentTrack = trackList.active(my.validTracks);
    my.widget.setTrack(my.currentTrack);
  };
  if (my.validTracks.length > 0) {
    updateTrack();
    my.player.on('timeupdate', timeUpdate);
    my.player.on('captionstrackchange', updateTrack);
    my.player.on('subtitlestrackchange', updateTrack);
  } else {
    throw new Error('videojs-transcript: No tracks found!');
  }
  return {
    el: function () {
      return my.widget.el();
    },
    setTrack: my.widget.setTrack
  };
};
videojs.plugin('transcript', transcript);

}(window, videojs));
