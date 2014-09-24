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
;( function ()
	{
		var FS = require( 'fs' )

		var OS = require( 'os' )

		var NUM_CPUS = OS.cpus().length

		var PATH = require( 'path' )

		var UTIL = require( 'util' )

		var EventEmitter = require( 'events' ).EventEmitter

		var EJS = require( 'ejs' )

		var CHOKIDAR = require( 'chokidar' )

		// use nbqueue to limit the number of async functions
		var Queue = require( 'nbqueue' )

		var QUEUE_SCAN = new Queue( NUM_CPUS )

		// resort to filename mime detection because node-webkit can't run mmmagic...
		var MIME = require( 'mime' )

		var FFMPEG = require( 'fluent-ffmpeg' )

		var ROOT_DIR = PATH.join( __dirname, '../', '../' )

		var VIEWS_DIR = PATH.join( ROOT_DIR, 'views' )

		var VIEWS = require( VIEWS_DIR )

		var WIN

		var AUDIO_REGEX = /^audio\/(?:(?!x\-mpegurl).*)$/

		var VIDEO_REGEX = /^video\//

		var SPAWN = require( 'child_process' ).spawn

		var MPLAYER_PATH

		var MPLAYER_PROCESS

		// audio element
		var AUDIO

		// set ffmpeg/ffprobe path if windows,
		// since windows users will more than
		// likely not have this setup
		if ( process.platform === 'win32' )
		{
			MPLAYER_PATH = PATH.join( ROOT_DIR, 'include', 'mplayer', 'mplayer.exe' )

			FFMPEG.setFfmpegPath( PATH.join( ROOT_DIR, 'include', 'ffmpeg', 'bin', 'ffmpeg.exe' ) )

			FFMPEG.setFfprobePath( PATH.join( ROOT_DIR, 'include', 'ffmpeg', 'bin', 'ffprobe.exe' ) )
		}

		else
		{
			MPLAYER_PATH = 'mplayer'
		}

		process.on( 'uncaughtException', function ( e )
			{
				console.log( e )

				console.trace()

				//process.exit( 1 )
			}
		)

		process.on( 'exit', function ()
			{
				if ( MPLAYER_PROCESS )
				{
					MPLAYER_PROCESS.kill( 'SIGKILL' )
				}
			}
		)

		// clamp a number between min and max
		function _clamp( target, min, max )
		{
			return target > min ? target < max ? target : max : min
		}

		function doError( str )
		{
			Server_log.call( this, 'error', str )
		}

		function doWarning( str )
		{
			Server_log.call( this, 'warning', str )
		}

		function doMessage( str )
		{
			Server_log.call( this, 'message', str )
		}

		/** @constructor */
		function Server()
		{
			// initialize EventEmitter on this instance
			EventEmitter.call( this )

			var that = this

			// define read-only isPlaying property
			Object.defineProperty( this, 'isPlaying',
				{
					get: function ()
					{
						return !!MPLAYER_PROCESS
					}
				}
			)

			var myPaused = false

			Object.defineProperty( this, 'isPaused',
				{
					get: function ()
					{
						return myPaused
					},

					set: function ( newValue )
					{
						if ( newValue !== myPaused )
						{
							if ( myPaused = newValue )
							{
								that.emit( 'pause' )
							}

							else
							{
								that.emit( 'unpause' )
							}
						}
					}
				}
			)

			var myVolume = 80;

			// volume: 0-100 float
			// use get/set accessor so the new value is always clamped
			Object.defineProperty( this, 'volume',
				{
					get: function ()
					{
						return myVolume
					},

					set: function ( newValue )
					{
						// clamp to be safe
						myVolume = _clamp( parseFloat( newValue ), 0, 100 )
					}
				}
			)

			var mySeekPercent = 0;

			// seekPercent: 0-100 float
			// use get/set accessor so the new value is always clamped
			Object.defineProperty( this, 'seekPercent',
				{
					get: function ()
					{
						return mySeekPercent
					},

					set: function ( newValue )
					{
						// clamp to be safe
						mySeekPercent = _clamp( parseFloat( newValue ), 0, 100 )
					}
				}
			)

			this
				.on( 'newlibraryfolder', function ( data )
					{
						Server_watchFolder.call( that, data.path )

						Server_scanFolder.call( that, data.path )
					}
				)

				.on( 'listening', function ()
					{
						// console.log( 'listening' )
					}
				)

				.on( 'connected', function ()
					{
						Server_init.call( that )
					}
				)

				.on( 'stopped', function ()
					{
						that.isPaused = false
					}
				)

				.on( 'playing', function ()
					{
						that.isPaused = false
					}
				)
		}

		// inherit from EventEmitter constructor
		UTIL.inherits( Server, EventEmitter )

		Server.prototype.kill = function ()
		{
			process.exit( 1 )
		}

		// render ejs file
		Server.prototype.renderFile = function ( name, data )
		{
			if ( !VIEWS[ name ] )
			{
				doError( 'tried to render file \'' + name + '\'.ejs, which does not exist' )

				return
			}

			var finalData = {}

			for ( var key in data )
			{
				finalData[ key ] = data[ key ]
			}

			finalData.filename = PATH.join( VIEWS_DIR, name + '.ejs' )

			return EJS.render( VIEWS[ name ], finalData )
		}

		Server.prototype.playSong = function ( path )
		{
			var that = this

			// check for existing process
			if ( MPLAYER_PROCESS )
			{
				// kill it with SIGTERM signal
				MPLAYER_PROCESS.kill( 'SIGKILL' )
			}

			// create a new mplayer process
			MPLAYER_PROCESS = SPAWN( MPLAYER_PATH,
				[
					'-slave',

					'-quiet',

					'-input', 'nodefault-bindings',

					'-noconfig', 'all',

					path

					//PATH.relative( __dirname, path )
				],

				{
					detached: false,

					stdio: 'pipe'
				}
			)

			MPLAYER_PROCESS
				// listen for close event
				.on( 'close', function ( code, signal )
					{
						// if no signal sent, unset MPLAYER_PROCESS
						if ( !signal )
						{
							MPLAYER_PROCESS = undefined
						}

						// clear timeout just in case
						clearTimeout( mplayerTimeout )

						that.emit( 'stopped' )
					}
				)

			this.emit( 'playing' )

			//var myLength

			//var myPercent = 0

			MPLAYER_PROCESS.stdout
				.on( 'data', function ( chunk )
					{
						var str = chunk.toString()

						// parse title and stuff from str or pull from db?

						var matches = str.match( /^ANS_([A-Za-z0-9_-]+)=([A-Za-z0-9 _-]+)/ )

						if ( matches )
						{
							var m1 = matches[ 1 ].toLowerCase()

							var m2 = matches[ 2 ]

							// process stuff before emitting event
							switch ( m1 )
							{
								case 'pause'
								:
									if ( !( that.isPaused = m2 === 'yes' ) )
									{
										initTimeout()
									}

									break

								case 'percent_position'
								:
									var f = parseFloat( m2 )

									// if value hasn't changed, return and don't emit event
									if ( f === that.seekPercent )
									{
										return
									}

									that.seekPercent = f

									break
							}

							that.emit( 'mplayer',
								{
									key: m1,

									value: m2
								}
							)
						}
					}
				)

			MPLAYER_PROCESS.stdin.write( 'pausing_keep_force get_time_length\n' )

			var mplayerTimeout

			var initTimeout = function ()
			{
				mplayerTimeout = setTimeout( function ()
					{
						if ( !MPLAYER_PROCESS || that.isPaused )
						{
							return
						}

						MPLAYER_PROCESS.stdin.write( 'pausing_keep_force get_percent_pos\n' )

						initTimeout()
					},

					100
				)
			}

			initTimeout()
		}

		Server.prototype.seekToPercent = function ( percent )
		{
			// make sure process exists
			if ( !MPLAYER_PROCESS )
			{
				return
			}

			// defaults to 0
			percent = parseFloat( typeof percent !== 'undefined' ? percent : 0 )

			// seek by percent
			MPLAYER_PROCESS.stdin.write( 'pausing_keep_force seek ' + percent + ' 1' )
		}

		// toggles pause on the currently playing song
		Server.prototype.pauseSong = function ()
		{
			// return if there is no mplayer process
			if ( !MPLAYER_PROCESS )
			{
				return
			}

			// pause the currently playing song
			MPLAYER_PROCESS.stdin.write( 'pause\n' )

			MPLAYER_PROCESS.stdin.write( 'pausing_keep_force get_property pause\n' )

			//this.emit( 'paused' )
		}

		Server.prototype.scanLibrary = function ( folders )
		{
			if ( !folders || !Array.isArray( folders ) )
			{
				return // folders must be an array
			}

			var that = this

			folders.forEach( function ( obj )
				{
					// obj = { path: full path to directory, mtime: last modified time }

					FS.stat( obj.path, function ( err, stats )
						{
							if ( err )
							{
								return console.log( err )
							}

							if ( !stats.isDirectory() )
							{
								return doWarning.call( that, 'could not scan \'' + obj.path + '\' because it is not a directory' )
							}

							Server_watchFolder.call( that, obj.path )

							Server_scanFolder.call( that, obj.path )
						}
					)
				}
			)
		}

		function Server_watchFolder( pathToFolder )
		{
			var that = this

			// watch with chokidar - uses a lot of memory, might want to experiment with other methods
			var watcher = CHOKIDAR.watch( pathToFolder,
				{
					ignored: /[\/\\]\./,

					persistent: true,

					usePolling: false
				}
			)

			watcher
				.on( 'error', function ( err )
					{
						console.log( err )
					}
				)

				.on( 'add', function ( path )
					{
						// stats from chokidar were not set on change, so call stat here
						FS.stat( path, function ( err, stats )
							{
								if ( err )
								{
									return console.log( err )
								}

								Server_scanFile.call( that, PATH.basename( path ), path, stats )
							}
						)
					}
				)

				.on( 'change', function ( path )
					{
						// stats from chokidar were not set on change, so call stat here
						FS.stat( path, function ( err, stats )
							{
								if ( err )
								{
									return console.log( err )
								}

								if ( stats.isDirectory() )
								{
									Server_scanFolder.call( that, path )

									return // directory
								}

								else
								{
									// assume file
									Server_scanFile.call( that, PATH.basename( path ), path, stats )
								}
							}
						)
					}
				)

				.on( 'addDir', function ( path )
					{
						Server_scanFolder.call( that, path )

						// watch folder?
					}
				)

				.on( 'unlink', function ( path )
					{
						// remove file
					}
				)

				.on( 'unlinkDir', function ( path )
					{
						// remove folder
					}
				)
		}

		function Server_scanFolder( path )
		{
			// make sure path exists
			if ( !path )
			{
				return
			}

			// reference this to use later
			var that = this

			FS.readdir( path, function ( err, files )
				{
					if ( err )
					{
						return console.log( err )
					}

					if ( !files )
					{
						return
					}

					//
					// WATCH THIS DIRECTORY HERE?
					//

					files.forEach( function ( file )
						{
							var filePath = PATH.join( path, file )

							FS.stat( filePath, function ( err, stats )
								{
									if ( err )
									{
										return // console.log( err )
									}

									// recursive scanning -
									// run this method on the file if it's a directory
									if ( stats.isDirectory() )
									{
										return Server_scanFolder.call( that, filePath )
									}

									Server_scanFile.call( that, file, filePath, stats )
								}
							)
						}
					)
				}
			)
		}

		// not really needed in mpserver anymore
		// converts seconds to formatted time - h:mm:ss
		/* function convertTime( seconds )
		{
			seconds = parseInt( seconds )

			var hours = Math.floor( seconds / ( 60 * 60 ) )

			var minutes = Math.floor( seconds / 60 ) - ( hours * ( 60 * 60 ) )

			seconds = seconds - ( minutes * 60 )

			var ret = ''

			if ( hours !== 0 )
			{
				ret += hours.toString() + ':'

				if ( minutes.toString().length === 1 )
				{
					minutes = '0' + minutes.toString()
				}
			}

			ret += minutes.toString() + ':'

			if ( seconds.toString().length === 1 )
			{
				seconds = '0' + seconds.toString()
			}

			ret += seconds.toString()

			return ret
		} */

		function Server_scanFile( fileName, filePath, stats )
		{
			if ( !filePath )
			{
				return
			}

			// return if hidden file
			if ( fileName.charAt( 0 ) === '.' )
			{
				return
			}

			var that = this

			var mime = MIME.lookup( filePath )

			if ( AUDIO_REGEX.test( mime ) )
			{
				// check indexeddb for existing file before scanning

				var transaction = WIN.mpdb.transaction( [ 'mpsongs' ], 'readonly' )

				var objectStore = transaction.objectStore( 'mpsongs' )

				var req = objectStore.get( filePath )

				req.onerror = function ( evt )
				{
					console.log( 'error' )

					console.log( evt )
				}

				req.onsuccess = function ( evt )
				{
					if ( evt.target.result && typeof evt.target.result.mtime !== 'undefined' && stats.mtime <= evt.target.result.mtime )
					{
						return
					}

					QUEUE_SCAN.add( function ( done )
						{
							//console.log( filePath )

							FFMPEG.ffprobe( filePath, function ( err, data )
								{
									if ( err )
									{
										//console.log( mime )

										//doError.call( that, err.message )

										return done()
									}

									var tags = data.format.tags || {}

									var track = ( tags.track || tags.TRACK || '' ).toString().split( '/' )[ 0 ].trim()

									if ( track !== '' )
									{
										track = parseInt( track )
									}

									that.emit( 'scannedsong',
										{
											track: track,

											title: ( tags.title || tags.TITLE || fileName ).toString().trim(),

											artist: ( tags.artist || tags.ARTIST || 'unknown artist' ).toString().trim(),

											album: ( tags.album || tags.ALBUM || 'unknown album' ).toString().trim(),

											duration: parseFloat( data.format.duration || 0 ),

											path: filePath,

											mtime: stats.mtime
										}
									)

									done()
								}
							)
						}
					)
				}
			}

			/* else

			if ( VIDEO_REGEX.test( mime ) )
			{

			} */

			// attempt to handle octet stream, maybe?
		}

		// fires when the server is connected to indexedDB
		function Server_init()
		{
			doMessage.call( this, 'mpserver running' )

			//this.scanLibrary()
		}

		function Server_log( type, str )
		{
			this.emit( 'log', { type: type, message: str } )
		}

		var server = new Server()

		module.exports = function ( win )
		{
			WIN = win || {}

			WIN.mpserver = server

			AUDIO = WIN.document.getElementById( 'mp-audio' )

			return WIN.mpserver
		}
	}
)();
