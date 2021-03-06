
var BrowserWindow = function(browserWindowProperties) {

  OPromise.call(this);

  browserWindowProperties = browserWindowProperties || {};

  this.properties = {
    'id': undefined, // not settable on create
    'closed': false, // not settable on create
    'focused': browserWindowProperties.focused ? !!browserWindowProperties.focused : undefined,
    // private:
    'incognito': browserWindowProperties.private ? !!browserWindowProperties.private : undefined,
    'parent': null,
    'width': browserWindowProperties.width ? parseInt(browserWindowProperties.width, 10) : undefined,
    'height': browserWindowProperties.height ? parseInt(browserWindowProperties.height, 10) : undefined,
    'top': browserWindowProperties.top ? parseInt(browserWindowProperties.top, 10) : undefined,
    'left': browserWindowProperties.left ? parseInt(browserWindowProperties.left, 10) : undefined
    // 'tabGroups' not part of settable properties
    // 'tabs' not part of settable properties
  };

  this._parent = null;

  // Create a unique browserWindow id
  this._operaId = Math.floor(Math.random() * 1e16);

  this.tabs = new BrowserTabManager(this);

  this.tabGroups = new BrowserTabGroupManager(this);

  if(this.properties.private !== undefined) {
    this.properties.incognito = !!this.properties.private;
    delete this.properties.private;
  }

  // Not allowed when creating a new window object
  if(this.properties.closed !== undefined) {
    delete this.properties.closed;
  }
};

BrowserWindow.prototype = Object.create(OPromise.prototype);

// API
BrowserWindow.prototype.__defineGetter__("id", function() {
  return this._operaId;
});

BrowserWindow.prototype.__defineGetter__("closed", function() {
  return this.properties.closed !== undefined ? !!this.properties.closed : false;
});

BrowserWindow.prototype.__defineGetter__("focused", function() {
  return this.properties.focused !== undefined ? !!this.properties.focused : false;
});

BrowserWindow.prototype.__defineGetter__("private", function() {
  return this.properties.incognito !== undefined ? !!this.properties.incognito : false;
});

BrowserWindow.prototype.__defineGetter__("top", function() {
  return this.properties.top !== undefined ? this.properties.top : -1;
}); // read-only

BrowserWindow.prototype.__defineGetter__("left", function() {
  return this.properties.left !== undefined ? this.properties.left : -1;
}); // read-only

BrowserWindow.prototype.__defineGetter__("height", function() {
  return this.properties.height !== undefined ? this.properties.height : -1;
}); // read-only

BrowserWindow.prototype.__defineGetter__("width", function() {
  return this.properties.width !== undefined ? this.properties.width : -1;
}); // read-only

BrowserWindow.prototype.__defineGetter__("parent", function() {
  return this._parent;
});

BrowserWindow.prototype.insert = function(browserTab, child) {

  if (!browserTab || !(browserTab instanceof BrowserTab)) {
    return;
  }

  if (this.properties.closed === true) {
    throw new OError(
      "InvalidStateError",
      "Current window is in the closed state and therefore is invalid",
      DOMException.INVALID_STATE_ERR
    );
  }

  var moveProperties = {
    windowId: this.properties.id,
    index: OEX.windows.length // by default, add to the end of the current window
  };

  // Set insert position for the new tab from 'before' attribute, if any
  if (child && (child instanceof BrowserTab)) {

    if (child.closed === true) {
      throw new OError(
        "InvalidStateError",
        "'child' parameter is in the closed state and therefore is invalid",
        DOMException.INVALID_STATE_ERR
      );
    }

    if (child._windowParent && child._windowParent.closed === true) {
      throw new OError(
        "InvalidStateError",
        "Parent window of 'child' parameter is in the closed state and therefore is invalid",
        DOMException.INVALID_STATE_ERR
      );
    }
    moveProperties.windowId = child._windowParent ?
                                      child._windowParent.properties.id : moveProperties.windowId;
    moveProperties.index = child.position;

  } else {
    // IF we're moving within the same window then index will be length - 1
    moveProperties.index = moveProperties.index > 0 ? moveProperties.index - 1 : moveProperties.index;
  }

  // Detach tab from existing BrowserWindow parent (if any)
  if (browserTab._windowParent) {
    browserTab._oldWindowParent = browserTab._windowParent;
    browserTab._oldIndex = browserTab.properties.index;

    if(browserTab._oldWindowParent !== this) {
      browserTab._windowParent.tabs.removeTab( browserTab );
    }
  }

  // Attach tab to new BrowserWindow parent
  browserTab._windowParent = this;

  // Update index within new parent
  browserTab.properties.index = moveProperties.index;

  if(this !== browserTab._oldWindowParent) {
    // Attach tab to new parent
    this.tabs.addTab( browserTab, browserTab.properties.index );
  }

  // Queue platform action or fire immediately if this object is resolved
  Queue.enqueue(browserTab, function(done) {
    chrome.tabs.move(
      browserTab.properties.id,
      {
        windowId: moveProperties.windowId || this.properties.id,
        index: moveProperties.index
      },
      function(_tab) {
        done();
      }.bind(this)
    );
  }.bind(this));

};

BrowserWindow.prototype.focus = function() {

  if(this.properties.focused == true || this.properties.closed == true) {
    return; // already focused or invalid because window is closed
  }

  // Set BrowserWindow object to focused state
  this.properties.focused = true;

  // unset all other window object's focused state
  for(var i = 0, l = OEX.windows.length; i < l; i++) {
    if(OEX.windows[i] !== this) {
      OEX.windows[i].properties.focused = false;
    }
  }

  // Queue platform action or fire immediately if this object is resolved
  Queue.enqueue(this, function(done) {
    chrome.windows.update(
      this.properties.id,
      { focused: true },
      function() {
        done();
      }.bind(this)
    );
  }.bind(this));

};

BrowserWindow.prototype.update = function(browserWindowProperties) {

  var updateProperties = {};

  if(browserWindowProperties.focused !== undefined && browserWindowProperties.focused == true) {
    this.properties.focused = updateProperties.focused = !!browserWindowProperties.focused;
  }

  if(browserWindowProperties.top !== undefined && browserWindowProperties.top !== null) {
    this.properties.top = updateProperties.top = parseInt(browserWindowProperties.top, 10);
  }

  if(browserWindowProperties.left !== undefined && browserWindowProperties.left !== null) {
    this.properties.left = updateProperties.left = parseInt(browserWindowProperties.left, 10);
  }

  if(browserWindowProperties.height !== undefined && browserWindowProperties.height !== null) {
    this.properties.height = updateProperties.height = parseInt(browserWindowProperties.height, 10);
  }

  if(browserWindowProperties.width !== undefined && browserWindowProperties.width !== null) {
      this.properties.width = updateProperties.width = parseInt(browserWindowProperties.width, 10);
    }

  if( !isObjectEmpty(updateProperties) ) {

    // Queue platform action or fire immediately if this object is resolved
    Queue.enqueue(this, function(done) {
      chrome.windows.update(
        this.properties.id,
        updateProperties,
        function() {
          done();
        }.bind(this)
      );
    }.bind(this));

  }

}

BrowserWindow.prototype.close = function() {

  if( this.properties.closed == true) {
    /*throw new OError(
      "InvalidStateError",
      "The current BrowserWindow object is already closed. Cannot call close on this object.",
      DOMException.INVALID_STATE_ERR
    );*/
    return;
  }

  // Set BrowserWindow object to closed state
  this.properties.closed = true;

  // Queue platform action or fire immediately if this object is resolved
  Queue.enqueue(this, function(done) {
    if(!this.properties.id) return;
    chrome.windows.remove(
      this.properties.id,
      function() {
        done();
      }.bind(this)
    );
  }.bind(this));

};
