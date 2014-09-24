/**
 * zodd - a node-webkit media library
 * Copyright (C) 2014 Kevin von Flotow
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software Foundation,
 * Inc., 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301  USA
 */
;( function ( WIN )
	{
		// document object
		var DOC = WIN.document

		var MPT = WIN.MPTable

		// body element
		var BODY

		// modal element
		var MODAL

		var AUDIO

		var TABLES = {}

		var TBODIES = {
			song: null,

			artist: null,

			album: null
		}

		var ROWS = {
			artist: {},

			album: {}
		}

		var SEEKBAR

		var VOLUMEBAR

		// localStorage object
		var STORAGE = WIN.localStorage

		// indexedDB object
		var IDB = WIN.indexedDB

		// event handling
		var GATOR = WIN.Gator

		// indexedDB connection
		//var DB

		// log levels 0-4
		var LOG_LEVELS = [ null, 'error', 'warning', 'message' ]

		// node-webkit GUI
		var GUI = require( 'nw.gui' )

		// main window
		var GUI_WINDOW = GUI.Window.get()

		var GUI_CLIPBOARD = GUI.Clipboard.get()

		// open splash window immediately

		/* var SPLASH_WINDOW = GUI.Window.open( 'splash.html',
			{
				frame: false,

				toolbar: false,

				resizable: false,

				position: 'center'
			}
		) */

		// clamp a number between min and max
		function _clamp( target, min, max )
		{
			return target > min ? target < max ? target : max : min
		}

		// http://stackoverflow.com/questions/15329167/closest-ancestor-matching-selector-using-native-dom
		function _closest( elem, selector )
		{
			while ( elem && elem.webkitMatchesSelector )
			{
				if ( elem.webkitMatchesSelector( selector ) )
				{
					return elem
				}

				else
				{
					elem = elem.parentNode
				}
			}

			return false
		}

		// window events
		;( function doWindowEvents()
			{
				GUI_WINDOW.on( 'loaded', function ()
					{
						STORAGE.setItem( 'mpMinimized', 0 )

						STORAGE.setItem( 'mpFullscreen', 0 )

						if ( STORAGE.getItem( 'mpWindowX' ) !== null )
						{
							//var moveX = _clamp( STORAGE.getItem( 'mpWindowX' ), 0, 43243787832 ) // WIN.screen.availWidth - 100

							var moveX = STORAGE.getItem( 'mpWindowX' )

							//var moveY = _clamp( STORAGE.getItem( 'mpWindowY' ), 0, 43243787832 ) // WIN.screen.availHeight - 100

							var moveY = STORAGE.getItem( 'mpWindowY' )

							STORAGE.setItem( 'mpWindowX', moveX )

							STORAGE.setItem( 'mpWindowY', moveY )

							GUI_WINDOW.moveTo( moveX, moveY )
						}

						if ( STORAGE.getItem( 'mpWindowWidth' ) !== null )
						{
							var resizeX = _clamp( STORAGE.getItem( 'mpWindowWidth' ), 0, WIN.screen.availWidth - 50 )

							var resizeY = _clamp( STORAGE.getItem( 'mpWindowHeight' ), 0, WIN.screen.availHeight - 50 )

							STORAGE.setItem( 'mpWindowWidth', resizeX )

							STORAGE.setItem( 'mpWindowHeight', resizeY )

							GUI_WINDOW.resizeTo( resizeX, resizeY )
						}

						
					}
				)

				var moveTimeout

				GUI_WINDOW.on( 'move', function ( x, y )
					{
						clearTimeout( moveTimeout )

						moveTimeout = setTimeout( function ()
							{
								if ( STORAGE.getItem( 'mpMaximized' ) == 1 || STORAGE.getItem( 'mpMinimized' ) == 1 || STORAGE.getItem( 'mpFullscreen' ) == 1 )
								{
									clearTimeout( resizeTimeout )

									return
								}

								STORAGE.setItem( 'mpWindowX', x )

								STORAGE.setItem( 'mpWindowY', y )
							},

							100
						)
					}
				)

				var resizeTimeout

				GUI_WINDOW.on( 'resize', function ( width, height )
					{
						clearTimeout( resizeTimeout )

						resizeTimeout = setTimeout( function ()
							{
								if ( STORAGE.getItem( 'mpMaximized' ) == 1 || STORAGE.getItem( 'mpMinimized' ) == 1 || STORAGE.getItem( 'mpFullscreen' ) == 1 )
								{
									clearTimeout( resizeTimeout )

									return
								}

								STORAGE.setItem( 'mpWindowWidth', width )

								STORAGE.setItem( 'mpWindowHeight', height )
							},

							100
						)
					}
				)

				GUI_WINDOW.on( 'maximize', function ()
					{
						STORAGE.setItem( 'mpMaximized', 1 )

						BODY.classList.add( 'mp-maximized' )
					}
				)

				GUI_WINDOW.on( 'unmaximize', function ()
					{
						STORAGE.setItem( 'mpMaximized', 0 )

						BODY.classList.remove( 'mp-maximized' )
					}
				)

				GUI_WINDOW.on( 'minimize', function ()
					{
						STORAGE.setItem( 'mpMinimized', 1 )
					}
				)

				GUI_WINDOW.on( 'restore', function ()
					{
						STORAGE.setItem( 'mpMinimized', 0 )
					}
				)
			}
		)()

		function loadTables()
		{
			var q = DOC.querySelectorAll( '[data-table]' )

			for ( var i = 0, l = q.length; i < l; ++i )
			{
				new MPT( q[ i ] )
			}
		}

		function setLocalStorageDefaults()
		{
			if ( STORAGE.getItem( 'mpLogLevel' ) === null )
			{
				STORAGE.setItem( 'mpLogLevel', 4 )
			}

			if ( STORAGE.getItem( 'mpWindowBorder' ) === null )
			{
				STORAGE.setItem( 'mpWindowBorder', 1 )
			}
		}

		var closeModalTimeout

		var fitTablesTimeout

		function showModal( popupName )
		{
			popupName = ( popupName || '' ).toString()

			var popup = MODAL.querySelectorAll( '[data-modal=' + popupName + ']' )

			if ( popup.length === 0 )
			{
				return
			}

			popup = popup[ 0 ]

			clearTimeout( closeModalTimeout )

			popup.style.setProperty( 'display', 'block' )

			MODAL.classList.add( 'mp-modal-active' )

			//fitTables( popup )

			var timeoutRunning = true

			var doFit = function ()
			{
				MPT.fit()

				if ( !timeoutRunning )
				{
					requestAnimationFrame( doFit )
				}
				
			}

			requestAnimationFrame( doFit )

			fitTablesTimeout = setTimeout( function ()
				{
					timeoutRunning = false

					MPT.fit()
				},

				// give time for transition to finish
				350
			)
		}

		function closeModal()
		{
			MODAL.classList.remove( 'mp-modal-active' )

			clearTimeout( fitTablesTimeout )

			//clearInterval( fitTablesInterval )

			clearTimeout( closeModalTimeout )

			closeModalTimeout = setTimeout( function ()
				{
					var q = MODAL.querySelectorAll( '[data-modal]' )

					for ( var i = 0, l = q.length; i < l; ++i )
					{
						q[ i ].style.setProperty( 'display', 'none' )
					}
				},

				250
			)
		}

		function doError( str )
		{
			WIN.mpserver.emit( 'log', { type: 'error', message: str } )
		}

		function doWarning( str )
		{
		   WIN.mpserver.emit( 'log', { type: 'warning', message: str } )
		}

		function doMessage( str )
		{
			WIN.mpserver.emit( 'log', { type: 'message', message: str } )
		}

		// based on: https://github.com/b1rdex/nw-contextmenu/blob/master/index.js
		// MIT license
		function TextContextMenu( cutLabel, copyLabel, pasteLabel )
		{
			var myMenu = new GUI.Menu()

			var enableCutAndCopy = WIN.getSelection().toString() !== ''

			var cutMenuItem = new GUI.MenuItem(
				{
					label: cutLabel || 'Cut',

					enabled: enableCutAndCopy,

					click: function()
					{
						DOC.execCommand( 'cut' )
					}
				}
			)

			var copyMenuItem = new GUI.MenuItem(
				{
					label: copyLabel || 'Copy',

					enabled: enableCutAndCopy,

					click: function()
					{
						DOC.execCommand( 'copy' )
					}
				}
			)

			var pasteMenuItem = new GUI.MenuItem(
				{
					label: pasteLabel || 'Paste',

					// only enable if clipboard isn't empty
					// supposedly doesn't work in linux, need
					// to see what it returns
					enabled: GUI_CLIPBOARD.get( 'text' ) !== '',

					click: function()
					{
						DOC.execCommand( 'paste' )
					}
				}
			)

			myMenu.append( cutMenuItem )

			myMenu.append( copyMenuItem )

			myMenu.append( pasteMenuItem )

			return myMenu;
		}

		function doLoadSong( data )
		{
			MPT.tables[ 'songs' ].addQueue( data )

			MPT.tables[ 'artists' ].addQueue( { artist: data.artist } )

			MPT.tables[ 'albums' ].addQueue( { album: data.album } )
		}

		var SONG_QUEUE = []

		var SONG_QUEUE_TIMEOUT

		var SONG_QUEUE_INTERVAL

		function processSongQueue()
		{
			var transaction = WIN.mpdb.transaction( 'mpsongs', 'readwrite' )

			var objectStore = transaction.objectStore( 'mpsongs' )

			var processNext = function ()
			{
				if ( SONG_QUEUE.length !== 0 )
				{
					var data = SONG_QUEUE.shift()

					var getRequest = objectStore.get( data.path )

					getRequest.onsuccess = function ( e )
					{
						if ( e.target.result )
						{
							// already defined, check modified time
							if ( data.mtime > e.target.result.mtime )
							{
								// updated file, use put
								var putRequest = objectStore.put( data )

								putRequest.onsuccess = function ( evt )
								{
									// update song row
									MPT.tables[ 'songs' ].update( { path: data.path }, data )

									// regenerate artists/albums?
									// should auto generate when songs are changed

									processNext()
								}
							}
						}

						else
						{
							// does not exist, use add to make sure it's not a duplicate
							var addRequest = objectStore.add( data )

							addRequest.onsuccess = function ( evt )
							{
								console.log( 'data saved' )

								// add to song table
								MPT.tables[ 'songs' ].add( data )

								// should switch to autogenerating artists and albums

								////////

								
								MPT.tables[ 'artists' ].add( { artist: data.artist } )

								MPT.tables[ 'albums' ].add( { album: data.album } )

								////////

								processNext()
							}
						}
					}
				}

				else
				{
					//console.log( 'complete' )
				}
			}

			processNext()
		}

		function addToSongQueue( data )
		{
			SONG_QUEUE.push( data )

			//clearInterval( SONG_QUEUE_INTERVAL )

			if ( !SONG_QUEUE_INTERVAL )
			{
				SONG_QUEUE_INTERVAL = setInterval( function ()
					{
						processSongQueue()
					},

					// process every second
					1000
				)
			}

			clearTimeout( SONG_QUEUE_TIMEOUT )

			SONG_QUEUE_TIMEOUT = setTimeout( function ()
				{
					clearInterval( SONG_QUEUE_INTERVAL )
				},

				// destroy after waiting 5 seconds
				5000
			)
		}

		function doServerScannedSong( data )
		{
			// add file to indexeddb

			/* addToSongQueue(
				{
					track: data.track,

					title: data.title,

					artist: data.artist,

					album: data.album,

					duration: data.duration,

					path: data.path,

					mtime: data.mtime
				}
			) */

			var newSong = {
				track: data.track,

				title: data.title,

				artist: data.artist,

				album: data.album,

				duration: data.duration,

				path: data.path,

				mtime: data.mtime
			}

			var transaction = WIN.mpdb.transaction( [ 'mpsongs' ], 'readwrite' )

			var objectStore = transaction.objectStore( 'mpsongs' )

			var getRequest = objectStore.get( data.path )

			getRequest.onsuccess = function ( e )
			{
				if ( e.target.result )
				{
					// already defined, check modified time
					if ( data.mtime > e.target.result.mtime )
					{
						// updated file, use put
						var putRequest = objectStore.put( newSong )

						putRequest.onsuccess = function ( evt )
						{
							// update song row
							MPT.tables[ 'songs' ].update( { path: data.path }, newSong )

							// regenerate artists/albums?
							// should auto generate when songs are changed
						}
					}
				}

				else
				{
					// does not exist, use add to make sure it's not a duplicate
					var addRequest = objectStore.add( newSong )

					addRequest.onsuccess = function ( evt )
					{
						console.log( 'data saved' )

						// add to song table
						MPT.tables[ 'songs' ].addQueue( data )

						// should switch to autogenerating artists and albums

						////////

						
						MPT.tables[ 'artists' ].addQueue( { artist: data.artist } )

						MPT.tables[ 'albums' ].addQueue( { album: data.album } )
					}
				}
			}
		}

		function doAddArtistsAlbumsRow( tableName, rowName, data )
		{
			data = data.toString()

			if ( !ROWS[ rowName ].hasOwnProperty( data ) )
			{
				var rowData = {}

				rowData[ rowName ] = data

				var html = WIN.mpserver.renderFile( rowName + '-row', rowData )

				var temp = DOC.createElement( 'table' )

				temp.innerHTML = html

				var row = temp.getElementsByTagName( 'tr' )

				if ( row[ 0 ] )
				{
					ROWS[ rowName ][ data ] = row[ 0 ].cloneNode( true )

					TBODIES[ rowName ].appendChild( ROWS[ rowName ][ data ] )
				}
			}

			else
			{
				var counter = ROWS[ rowName ][ data ].getElementsByClassName( 'mp-song-count' )

				if ( counter[ 0 ] )
				{
					counter = counter[ 0 ]

					counter.innerText = parseInt( counter.innerText ) + 1
				}
			}

			sortTable( tableName )
		}

		function sortTable( tableName )
		{

		}

		function doServerLog( data )
		{
			data = data || {}

			data.type = ( data.type || 'message' ).toString()

			var logLevel = STORAGE.getItem( 'mpLogLevel' )

			if ( logLevel !== null && LOG_LEVELS.indexOf( data.type ) >= logLevel )
			{
				return
			}

			data.message = ( data.message || '' ).toString()

			console.log( '[' + Date.now() + '] mpserver ' + data.type + ': ' + data.message )
		}

		function doServerConnected()
		{
			loadLibraryFolders()
		}

		function doServerCheckSong( data )
		{
			if ( !data || !data.path )
			{
				return
			}

			console.log( data )

			var transaction = WIN.mpdb.transaction( [ 'mpsongs' ], 'readonly' )

			var objectStore = transaction.objectStore( 'mpsongs' )

			var req = objectStore.get( data.path )

			req.onerror = function ( evt )
			{
				console.log( 'error' )

				console.log( evt )
			}

			req.onsuccess = function ( evt )
			{
				//console.log( evt.result )

				
			}
		}

		function doServerStopped()
		{
			// reset seekbar
			SEEKBAR.value = 0
		}

		function doServerPlaying( data )
		{

		}

		function doServerPause()
		{

		}

		function doServerUnpause()
		{

		}

		function doMplayerEvent( data )
		{
			switch ( data.key )
			{
				case 'percent_position'
				:
					SEEKBAR.value = _clamp( parseFloat( data.value ), 0, 100 )

					break
			}
		}

		function doOnReady()
		{
			// document is ready

			// make sure mpserver exists
			if ( !WIN.mpserver )
			{
				console.log( 'mpserver failed to load' )

				// exit the program
				GUI_WINDOW.close( true )

				return
			}

			BODY = DOC.getElementsByTagName( 'body' )

			if ( BODY.length === 0 )
			{
				return
			}

			BODY = BODY[ 0 ]

			MODAL = DOC.getElementById( 'mp-modal' )

			TBODIES.song = DOC.getElementById( 'mp-songs-tbody' )

			TBODIES.artist = DOC.getElementById( 'mp-artists-tbody' )

			TBODIES.album = DOC.getElementById( 'mp-albums-tbody' )

			SEEKBAR = DOC.getElementById( 'mp-seekbar-input' )

			VOLUMEBAR = DOC.getElementById( 'mp-volumebar-input' )

			setLocalStorageDefaults()

			WIN.mpserver
				.on( 'connected', doServerConnected )

				.on( 'log', doServerLog )

				.on( 'checksong', doServerCheckSong )

				.on( 'scannedsong', doServerScannedSong )

				.on( 'stopped', doServerStopped )

				.on( 'pause', doServerPause )

				.on( 'unpause', doServerUnpause )

				.on( 'playing', doServerPlaying )

				.on( 'mplayer', doMplayerEvent )

				.emit( 'listening' )

			var that = this

			var request = IDB.open( 'mpdb', 1 )

			request.onupgradeneeded = function ( e )
			{
				var db = e.target.result

				db.onerror = function ( err )
				{
					doError.call( that, 'indexedDB error' )

					console.log( err )
				}

				// create objectstores

				// MPLIBRARY
				if ( !db.objectStoreNames.contains( 'mplibrary' ) )
				{
					var libraryObjectStore = db.createObjectStore( 'mplibrary', { keyPath: 'path' } )
				}

				// MPSONGS
				if ( !db.objectStoreNames.contains( 'mpsongs' ) )
				{
					var songsObjectStore = db.createObjectStore( 'mpsongs', { keyPath: 'path' } )

					// create some indices
					songsObjectStore.createIndex( 'title', 'title', { unique: false } )

					songsObjectStore.createIndex( 'artist', 'artist', { unique: false } )

					songsObjectStore.createIndex( 'album', 'album', { unique: false } )
				}
			}

			request.onerror = function ( e )
			{
				doError.call( that, 'indexedDB error' )

				console.log( e )

				// exit the program
				GUI_WINDOW.close( true )
			}

			request.onsuccess = function ( e )
			{
				doMessage.call( that, 'connected to indexedDB' )

				WIN.mpdb = e.target.result

				/////

				// load songs from db

				var transaction = WIN.mpdb.transaction( [ 'mpsongs' ], 'readwrite' )

				var objectStore = transaction.objectStore( 'mpsongs' )

				var req = objectStore.openCursor()

				req.onerror = function ( evt )
				{
					console.log( 'error' )

					console.log( evt )
				}

				var resultSongs = []

				var resultArtists = []

				var resultAlbums = []

				req.onsuccess = function ( evt )
				{
					var cursor = evt.target.result

					if ( cursor )
					{
						//console.log( cursor.value )
						//doLoadSong( cursor.value )

						resultSongs.push( cursor.value )

						resultArtists.push( { artist: cursor.value.artist } )

						resultAlbums.push( { album: cursor.value.album } )

						//cursor.delete()

						cursor.continue()
					}

					else
					{
						// no more results


						MPT.tables[ 'songs' ].addBulk( resultSongs )

						MPT.tables[ 'artists' ].addBulk( resultArtists )

						MPT.tables[ 'albums' ].addBulk( resultAlbums )

						//SPLASH_WINDOW.close( false )

						if ( STORAGE.getItem( 'mpMaximized' ) == 1 )
						{
							GUI_WINDOW.maximize()

							BODY.classList.add( 'mp-maximized' )
						}

						GUI_WINDOW.show()

						// loaded files from database
						//WIN.mpserver.emit( 'loaded' )
					}
				}

				/////

				//loadTables()

				WIN.mpserver.emit( 'connected' )

				//GUI_WINDOW.show()
			}

			loadTables()
		}

		function loadLibraryFolders()
		{
			var transaction = WIN.mpdb.transaction( [ 'mplibrary' ], 'readonly' )

			var objectStore = transaction.objectStore( 'mplibrary' )

			var req = objectStore.openCursor()

			req.onerror = function ( evt )
			{
				console.log( 'error' )

				console.log( evt )
			}

			var resultFolders = []

			req.onsuccess = function ( evt )
			{
				var cursor = evt.target.result

				if ( cursor )
				{
					resultFolders.push( cursor.value )

					cursor.continue()
				}

				else
				{
					var modal = loadModal( 'settings', WIN.mpserver.renderFile( 'settings',
						{
							customWindowBorder: STORAGE.getItem( 'mpWindowBorder' ) == '1',

							libraryFolders: resultFolders
						}
					))

					// create table
					new MPT( modal )

					WIN.mpserver.scanLibrary( resultFolders )
				}
			}
		}

		function loadModal( name, html )
		{
			if ( !name || !html )
			{
				return doError( 'lodalModal: invalid arguments' )
			}

			var div = DOC.createElement( 'div' )

			div.setAttribute( 'data-modal', name )

			div.classList.add( 'mp-modal-center' )

			var inner = DOC.createElement( 'div' )

			inner.classList.add( 'mp-inner' )

			inner.innerHTML = html

			div.appendChild( inner )

			MODAL.appendChild( div )

			return div
		}

		function isById( elem, id, recursive )
		{
			if ( elem.id === id )
			{
				return true
			}

			if ( !recursive )
			{
				return false
			}

			var p = elem.parentNode

			while ( p !== null )
			{
				if ( p.id === id )
				{
					return true
				}

				p = p.parentNode
			}

			return false
		}

		function doClickModal( e )
		{
			if ( !e.target.getAttribute( 'data-modal' ) )
			{
				return
			}

			e.preventDefault()

			closeModal()
		}

		function doClickMenuButton( e )
		{
			e.preventDefault()

			var mainMenu = new GUI.Menu()

			var guiSeparator = new GUI.MenuItem( { type: 'separator' } )

			mainMenu.append( new GUI.MenuItem(
				{
					label: 'Settings',

					click: function ()
					{
						showModal( 'settings' )
					}
				}
			))

			mainMenu.append( guiSeparator )

			var fullscreenItem = new GUI.MenuItem(
				{
					label: 'Fullscreen',

					type: 'checkbox',

					checked: GUI_WINDOW.isFullscreen,

					click: function ()
					{
						GUI_WINDOW.toggleFullscreen()

						fullscreenItem = GUI_WINDOW.isFullscreen

						STORAGE.setItem( 'mpFullscreen', fullscreenItem ? 1 : 0 )

						BODY.classList[ fullscreenItem ? 'add' : 'remove' ]( 'mp-fullscreen' )
					}
				}
			)

			mainMenu.append( fullscreenItem )

			mainMenu.append( guiSeparator )

			mainMenu.append( new GUI.MenuItem(
				{
					label: 'Console',

					click: function ()
					{
						// open dev tools
						GUI_WINDOW.showDevTools()
					}
				}
			))

			mainMenu.append( new GUI.MenuItem(
				{
					label: 'Documentation',

					click: function ()
					{
								
					}
				}
			))

			mainMenu.append( guiSeparator )

			mainMenu.append( new GUI.MenuItem(
				{
					label: 'About',

					click: function ()
					{
						// open about popup
						showModal( 'about' )
					}
				}
			))

			mainMenu.append( guiSeparator )

			mainMenu.append( new GUI.MenuItem(
				{
					label: 'Exit',

					click: function ()
					{
						GUI_WINDOW.close()
					}
				}
			))

			mainMenu.popup( e.pageX - 20, e.pageY )
		}

		// close handler
		GUI_WINDOW.on( 'close', function ()
			{
				// pretend to close
				this.hide()

				WIN.mpserver.kill()

				this.close( true )
			}
		)

		function doClickTitleClose()
		{
			GUI_WINDOW.close()
		}

		function doClickMaximize()
		{
			GUI_WINDOW[ STORAGE.getItem( 'mpMaximized' ) == 1 ? 'unmaximize' : 'maximize' ]()
		}

		function doClickMinimize()
		{
			GUI_WINDOW[ STORAGE.getItem( 'mpMinimized' ) == 1 ? 'restore' : 'minimize' ]()
		}

		function doAutoTrim()
		{
			// use this instead of built in trim to allow 1 space at the end
			this.value = this.value.replace( /^\s+/, '' ).replace( /\s\s+/, ' ' )
		}

		var CONTEXT_MENUS = {
			text: TextContextMenu
		}

		function doContextMenu( e )
		{
			var menuName = this.getAttribute( 'data-context-menu' )

			if ( !CONTEXT_MENUS.hasOwnProperty( menuName ) )
			{
				return
			}

			e.preventDefault()

			new CONTEXT_MENUS[ menuName ]().popup( e.pageX, e.pageY )
		}

		function doFileButtonChange( e )
		{
			var p = _closest( e.target, '.mp-settings' )

			if ( !p )
			{
				return
			}

			var t = p.querySelector( 'tbody' )

			if ( !t )
			{
				return
			}

			////////////////

			var val = this.value

			if ( !val || val.length === 0 )
			{
				return
			}

			var newFolder = {
				path: val.toString(),

				// set mtime to 0 so it always scans the first time it checks
				mtime: 0
			}

			var transaction = WIN.mpdb.transaction( [ 'mplibrary' ], 'readwrite' )

			var objectStore = transaction.objectStore( 'mplibrary' )

			var request = objectStore.add( newFolder )

			var that = this

			request.onerror = function ( evt )
			{
				console.log( 'error' )

				console.log( evt )
			}

			request.onsuccess = function ( evt )
			{
				doMessage.call( that, 'added folder "' + val + '" to library' )

				t.insertAdjacentHTML( 'beforeend', WIN.mpserver.renderFile( 'library-folder-row',
					{
						libraryFolders: [ newFolder ],

						// pass index as 0
						i: 0
					}
				))

				// notify server of new folder
				WIN.mpserver.emit( 'newlibraryfolder', newFolder )
			}
		}

		function doResize()
		{
			MPT.fit()
		}

		function doPlayOrPause()
		{
			if ( WIN.mpserver.isPlaying )
			{
				// pause
				WIN.mpserver.pauseSong()
			}

			else
			{
				// not playing, attempt to play first song in filtered list

			}
		}

		function doSeekbarChange()
		{
			if ( !WIN.mpserver.isPlaying )
			{
				this.value = 0

				return
			}

			WIN.mpserver.seekToPercent( this.value )

			// console.log( this.value )
		}

		// event handlers
		GATOR( DOC )
			.on( 'click', '#mp-modal', doClickModal )

			.on( 'click', '#mp-menu-button', doClickMenuButton )

			.on( 'click', '#mp-titlebar-close', doClickTitleClose )

			.on( 'click', '#mp-titlebar-maximize', doClickMaximize )

			.on( 'click', '#mp-titlebar-minimize', doClickMinimize )

			.on( 'click', '#mp-playpause', doPlayOrPause )

			.on( 'contextmenu', '[data-context-menu]', doContextMenu )

			.on( 'input', '.mp-auto-trim', doAutoTrim )

			.on( 'change', '.mp-file-button input[type=file]', doFileButtonChange )

			.on( 'input', '#mp-seekbar-input', doSeekbarChange )

			.on( 'change', '#mp-seekbar-input', doSeekbarChange )

		GATOR( WIN )
			.on( 'resize', doResize )

		/////// wait for document to finish loading

		if ( DOC.readyState === 'complete' )
		{
			doOnReady()
		}

		else
		{
			DOC.onreadystatechange = function ()
			{
				var state = DOC.readyState

				/* if ( state === 'interactive' )
				{
					console.log( 'interactive' )
				}

				else */

				if ( state === 'complete' )
				{
					// console.log( 'complete' )

					doOnReady()
				}
			}
		}
	}
)( window );
