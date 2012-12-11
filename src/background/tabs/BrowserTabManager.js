
var BrowserTabManager = function( parentObj ) {

  OPromise.call( this );

  // Set up 0 mock BrowserTab objects at startup
  this.length = 0;

  this._lastFocusedTab = null;

  this._parent = parentObj;

  // Remove all collection items and replace with browserTabs
  this.replaceTabs = function( browserTabs ) {

    for( var i = 0, l = this.length; i < l; i++ ) {
      delete this[ i ];
    }
    this.length = 0;

    for( var i = 0, l = browserTabs.length; i < l; i++ ) {
      if(this !== OEX.tabs) {
        browserTabs[ i ].properties.index = i;
      }
      browserTabs[ i ].properties.closed = false;
      this[ i ] = browserTabs[ i ];
    }
    this.length = browserTabs.length;
  };

  // Add an array of browserTabs to the current collection
  this.addTabs = function( browserTabs, startPosition ) {
    // Extract current set of tabs in collection
    var allTabs = [];
    for(var i = 0, l = this.length; i < l; i++) {
      allTabs[ i ] = this[ i ];
    }

    // Add new browserTabs to allTabs array
    var spliceArgs = [startPosition || allTabs.length - 1, 0].concat( browserTabs );
    Array.prototype.splice.apply(allTabs, spliceArgs);

    // Rewrite the current tabs collection in order
    for( var i = 0, l = allTabs.length; i < l; i++ ) {
      if(this !== OEX.tabs) {
        // Update all tab indexes to the current tabs collection order
        allTabs[ i ].properties.index = i;
      }
      allTabs[ i ].properties.closed = false;
      this[ i ] = allTabs[ i ];
    }
    this.length = allTabs.length;
    
  };

  // Remove a browserTab from the current collection
  this.removeTab = function( browserTab ) {
    
    var oldCollectionLength = this.length;
    
    // Extract current set of tabs in collection
    var allTabs = [];
    var removeTabIndex = -1;
    for(var i = 0, l = this.length; i < l; i++) {
      allTabs[ i ] = this[ i ];
      if( allTabs[ i ].id == browserTab.id ) {
        removeTabIndex = i;
      }
    }

    // Remove browser tab
    if(removeTabIndex > -1) {
      allTabs.splice(removeTabIndex, 1);
    }
    
    // Indicate that this tab is now closed
    browserTab.properties.closed = true;
    // Detach _windowParent from removed tab
    browserTab._windowParent = null;

    // Rewrite the current tabs collection
    for( var i = 0, l = allTabs.length; i < l; i++ ) {
      if(this !== OEX.tabs) {
        allTabs[ i ].properties.index = i;
      }
      this[ i ] = allTabs[ i ];
    }
    this.length = allTabs.length;
    
    // Remove any ghost items, if any
    if(oldCollectionLength > this.length) {
      for(var i = this.length, l = oldCollectionLength; i < l; i++) {
        delete this[ i ];
      }
    }
    
  };

};

BrowserTabManager.prototype = Object.create( OPromise.prototype );

BrowserTabManager.prototype.create = function( browserTabProperties, before ) {

  browserTabProperties = browserTabProperties || {};

  var shadowBrowserTab = new BrowserTab();
  
  // Parameter mappings
  if(browserTabProperties.focused !== undefined) {
    browserTabProperties.active = !!browserTabProperties.focused;
    // Not allowed in Chromium API
    delete browserTabProperties.focused;
  } else {
    // Explicitly set active to false by default in Opera implementation
    browserTabProperties.active = false;
  }
  
  if(browserTabProperties.locked !== undefined) {
    browserTabProperties.pinned = !!browserTabProperties.locked;
    delete browserTabProperties.locked;
  }
  
  for (var i in browserTabProperties) {
    shadowBrowserTab.properties[i] = browserTabProperties[i];
  }

  // TODO handle private tab insertion differently in Chromium
  //browserTabProperties.incognito = browserTabProperties.private || false;

  // Set parent window to create the tab in

  if(this._parent && this._parent.closed === true ) {
    throw {
        name:        "Invalid State Error",
        message:     "Parent window is in the closed state and therefore is invalid"
    };
  }
  // no windowId will default to adding the tab to the current window
  browserTabProperties.windowId = this._parent ? this._parent.properties.id : OEX.windows.getLastFocused().properties.id;

  // Set insert position for the new tab from 'before' attribute, if any
  if( before && before instanceof BrowserTab ) {

    if( before.closed === true ) {
      throw {
          name:        "Invalid State Error",
          message:     "'before' attribute is in the closed state and therefore is invalid"
      };
    }

    if(before._windowParent && before._windowParent.closed === true ) {
      throw {
          name:        "Invalid State Error",
          message:     "Parent window of 'before' attribute is in the closed state and therefore is invalid"
      };
    }
    browserTabProperties.windowId = before._windowParent ?
                                      before._windowParent.properties.id : browserTabProperties.windowId;
    browserTabProperties.index = before.position;

  }
  
  // Add this object to the end of the current tabs collection
  this.addTabs([ shadowBrowserTab ]);

  // Add this object to the root tab manager (if this is not the root tab manager)
  if(this !== OEX.tabs) {
    OEX.tabs.addTabs([ shadowBrowserTab ]);
  }

  // Queue platform action or fire immediately if this object is resolved
  this.enqueue( chrome.tabs.create, browserTabProperties, function( _tab ) {

      // Update BrowserTab properties
      for(var i in _tab) {
        shadowBrowserTab.properties[i] = _tab[i];
      }

      // Set up the shadowBrowserTab's parent BrowserWindow relationship
      var noParentWindow = true;

      if(_tab.windowId) {
        var _windows = opera.extension.windows;
        for(var i = 0, l = _windows.length; i < l; i++ ) {
          if( _windows[ i ].properties.id === _tab.windowId ) {
            noParentWindow = false;
            shadowBrowserTab._windowParent = _windows[ i ];
            break;
          }
        }
      }

      // Add to the default window if there is no other parent to use
      if( noParentWindow ) {
        shadowBrowserTab._windowParent = OEX.windows.getLastFocused();
      }
    
      // TODO check what correct behavior should be for this
      // Move this object to the correct position within the current tabs collection
      // (but don't worry about doing this for the global tabs manager)
      /*if(this !== OEX.tabs) {
        this.removeTab( shadowBrowserTab );
        this.addTabs([ shadowBrowserTab ], shadowBrowserTab.properties.index);
      }*/

      // Resolve new tab, if it hasn't been resolved already
      shadowBrowserTab.resolve( _tab );

      // Dispatch oncreate event to all attached event listeners
      this.dispatchEvent( new OEvent('create', {
          "tab": shadowBrowserTab,
          "prevWindow": shadowBrowserTab._windowParent,
          "prevTabGroup": null,
          "prevPosition": -1
      }) );

      this.dequeue();

  }.bind(this));

  return shadowBrowserTab;

};

BrowserTabManager.prototype.getAll = function() {

  var allTabs = [];

  for(var i = 0, l = this.length; i < l; i++) {
    allTabs[ i ] = this[ i ];
  }

  return allTabs;

};

BrowserTabManager.prototype.getSelected = function() {

  return this._lastFocusedTab || this[ 0 ];

};
// Alias of .getSelected()
BrowserTabManager.prototype.getFocused = BrowserTabManager.prototype.getSelected;

BrowserTabManager.prototype.close = function( browserTab ) {

  if( !browserTab || !browserTab instanceof BrowserTab ) {
    return;
  }
  
  browserTab.close();

};