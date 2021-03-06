
var OBackgroundMessagePort = function() {

  OMessagePort.call( this, true );

  this._allPorts = {};

  chrome.extension.onConnect.addListener(function( _remotePort ) {

    var portIndex = _remotePort['name'] || Math.floor(Math.random() * 1e16);

    // When this port disconnects, remove _port from this._allPorts
    _remotePort.onDisconnect.addListener(function() {

      delete this._allPorts[ portIndex ];

      this.dispatchEvent( new OEvent('disconnect', { "source": _remotePort }) );

    }.bind(this));

    this._allPorts[ portIndex ] = _remotePort;

    _remotePort.onMessage.addListener( function( _message, _sender, responseCallback ) {

      if(_message && _message.action && _message.action.indexOf('___O_') === 0) {

        // Fire controlmessage events *immediately*
        this.dispatchEvent( new OEvent(
          'controlmessage',
          {
            "data": _message,
            "source": {
              postMessage: function( data ) {
                _remotePort.postMessage( data );
              },
              "tabId": _remotePort.sender && _remotePort.sender.tab ? _remotePort.sender.tab.id : null
            }
          }
        ) );

      } else {

        // Fire 'message' event once we have all the initial listeners setup on the page
        // so we don't miss any .onconnect call from the extension page.
        // Or immediately if the shim isReady
        addDelayedEvent(this, 'dispatchEvent', [ new OEvent(
          'message',
          {
            "data": _message,
            "source": {
              postMessage: function( data ) {
                _remotePort.postMessage( data );
              },
              "tabId": _remotePort.sender && _remotePort.sender.tab ? _remotePort.sender.tab.id : null
            }
          }
        ) ]);

      }

    }.bind(this) );

    this.dispatchEvent( new OEvent('connect', { "source": _remotePort, "origin": "" }) );

  }.bind(this));

};

OBackgroundMessagePort.prototype = Object.create( OMessagePort.prototype );

OBackgroundMessagePort.prototype.broadcastMessage = function( data ) {

  for(var activePort in this._allPorts) {
    this._allPorts[ activePort ].postMessage( data );
  }

};
