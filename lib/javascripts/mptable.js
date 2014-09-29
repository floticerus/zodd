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
		var DOC = WIN.document

		var GATOR = WIN.Gator

		// clamp a number between min and max
		function _clamp( target, min, max )
		{
			return target > min ? target < max ? target : max : min
		}

		/** @constructor */
		function MPTable( elem )
		{
			this.tables = elem.getElementsByTagName( 'table' )

			if ( this.tables.length !== 2 )
			{
				return
			}

			var firstRow = this.tables[ 1 ].getElementsByClassName( 'mp-dt-first-row' )

			if ( !firstRow[ 0 ] )
			{
				return
			}

			this.data = []

			this.query = null

			this.filtered = []

			this.elem = elem

			this.name = elem.getAttribute( 'data-table' )

			this.sortOrder = ( elem.getAttribute( 'data-table-sort' ) || '' ).toString().split( ' ' )

			this.firstRow = firstRow[ 0 ]

			// set row height for this table
			var firstCell = this.firstRow.getElementsByTagName( 'td' )[ 0 ]

			// temporary &nbsp; - u00a0 translates to &nbsp;
			firstCell.innerHTML = '\u00a0'

			// get the row height to use later
			this.rowHeight = parseFloat( WIN.getComputedStyle( this.firstRow, null ).getPropertyValue( 'height' ) )

			// reset the html
			firstCell.innerHTML = ''

			MPTable.tables[ this.name ] = this

			this.rowSpacing = 1

			var thead = elem.getElementsByTagName( 'thead' )

			this.thead = thead[ 0 ] ? thead[ 0 ] : null

			this.th = this.thead.getElementsByTagName( 'th' )

			var tbody = elem.getElementsByTagName( 'tbody' )

			this.tbody = tbody[ 0 ] ? tbody[ 0 ] : null

			this.firstRowTd = this.firstRow.getElementsByTagName( 'td' )

			var tscroll = elem.getElementsByClassName( 'mp-scroll' )

			this.scroll = tscroll[ 0 ] ? tscroll[ 0 ] : null

			if ( this.unique = elem.getAttribute( 'data-table-unique' ) === 'true' )
			{
				this.uniqueRows = {}

				this.rowSpacing = 2

				this.allRow = this.tbody.getElementsByClassName( 'mp-dt-all' )[ 0 ]

				this.uniqueCount = this.allRow.getElementsByClassName( 'mp-dt-unique-count' )[ 0 ]

				this.songCount = this.allRow.getElementsByClassName( 'mp-dt-song-count' )[ 0 ]
			}

			// setup now but define in this.fit()
			this.tableHeight = 0

			this.maxRows = 0

			// starting visible index
			this.visibleStart = 0

			// total number of visible rows
			this.visibleRows = 0

			this.spacerTop = DOC.createElement( 'tr' )

			this.tbody.appendChild( this.spacerTop )

			this.spacerBottom = DOC.createElement( 'tr' )

			//this.spacerBottom.style.setProperty( 'min-height', this.rowHeight * 2 )

			this.tbody.appendChild( this.spacerBottom )

			this.rowId = 0

			this.lastStartRow = 0

			this.lastEndRow = 0

			this.readAhead = 20

			this.watching = []

			this.selectedRows = []

			this.addQueueTimeout = null

			this.addQueueArray = []

			this.lastProcessQueue = 0

			this.maxInQueue = 5000

			this.fitTimeout = null

			this.maxFitInterval = 500

			this.lastFit = Date.now()

			this.fit()

			var that = this

			this.scroll.addEventListener( 'scroll', function ()
				{
					that.fitScroll()
				}
			)

			// add click handlers to th elements for sorting the table
			Array.prototype.forEach.call( this.th, function ( thElement )
				{
					var thSort = thElement.getAttribute( 'data-table-click-sort' )

					if ( null === thSort )
					{
						return
					}

					// split the sort order into an array
					thSort = thSort.toString().split( ' ' )

					thElement.addEventListener( 'click', function ()
						{
							// copy new array to work with
							var newSortOrder = thSort.slice()

							// sort descending if needed
							if ( that.sortOrder[ 0 ] === newSortOrder[ 0 ] && that.sortOrder[ 0 ].charAt( 0 ) !== '-' )
							{
								newSortOrder[ 0 ] = '-' + newSortOrder[ 0 ]
							}

							// set the new sort order
							that.sortOrder = newSortOrder

							// run filter just before sorting
							that.filter()

							// sort the table
							that.sort()
						}
					)
				}
			)

			GATOR( this.tbody )
				.on( 'click', 'tr', function ( e )
					{
						that.selectRow( this, e )
					}
				)

				.on( 'dblclick', '[data-song-path]', function ()
					{
						that.playSong( this.getAttribute( 'data-song-path' ) )
					}
				)
		}

		// keep track of all loaded tables
		MPTable.tables = {}

		// fits all tables
		MPTable.fit = function ()
		{
			for ( var key in MPTable.tables )
			{
				MPTable.tables[ key ].fit()
			}
		}

		// fit individual table
		MPTable.prototype.fit = function ()
		{
			this.tableHeight = parseFloat( WIN.getComputedStyle( this.scroll, null ).getPropertyValue( 'height' ) )

			this.maxRows = this.tableHeight / this.rowHeight

			for ( var i = 0, l = this.firstRowTd.length, w; i < l; ++i )
			{
				// get actual width from head cells
				w = parseFloat( WIN.getComputedStyle( this.th[ i ], null ).getPropertyValue( 'width' ) )

				// add 1 to make it fit... probably because of border
				// should fix in css
				w += 1

				this.firstRowTd[ i ].style.setProperty( 'width', w )
			}

			this.fitScroll()
		}

		// testing a filter method. might need to build indices instead, or pass to web worker
		MPTable.prototype.filter = function ( query, forceFresh )
		{
			// query = object or string

			console.log( query )

			if ( query )
			{
				this.query = query
			}

			else

			if ( !forceFresh && this.query )
			{
				query = this.query
			}

			else
			{
				console.log( 'no query provided' )

				// set query to null
				this.query = null

				this.filtered = this.data

				return
			}

			// new filtered array
			var filtered = []

			// check for object
			if ( Object.prototype.toString.call( query ) === '[object Object]' )
			{
				// match against specified keys

				var keys = query.keys()

				var kl = keys.length()

				loop1:
				for ( var i = 0, l = this.data.length, i2, c, reg; i < l; ++i )
				{
					c = this.data[ i ]

					loop2:
					for ( i2 = 0; i2 < kl; ++i2 )
					{
						reg = new RegExp( '\\b' + query[ keys[ i2 ] ].toString().toLowerCase(), 'g' )

						// make sure the property exists
						if ( c.data.hasOwnProperty( keys[ i2 ] )

							// case insensitive test
							&& reg.test( c.data[ keys[ i2 ] ].toString().toLowerCase() )

							// make sure this isn't already in the results array
							&& filtered.indexOf( c ) === -1 )
						{
							// match. push to filtered array
							filtered.push( c )

							break loop2
						}
					}
				}
			}

			// assume string
			else
			{
				var testAgainst = [ 'artist', 'album', 'title' ]

				var testCount = testAgainst.length

				var reg = new RegExp( '\\b' + query.toString().toLowerCase(), 'g' )

				// match against anything
				loop1:
				for ( var i = 0, l = this.data.length, c, i2; i < l; ++i )
				{
					c = this.data[ i ]

					loop2:
					for ( i2 = 0; i2 < testCount; ++i2 )
					{
						// make sure the property exists
						if ( c.data.hasOwnProperty( testAgainst[ i2 ] )

							// case insensitive test
							&& reg.test( c.data[ testAgainst[ i2 ] ].toString().toLowerCase() )

							// make sure this isn't already in the results array
							&& filtered.indexOf( c ) === -1 )
						{
							// match. push to filtered array
							filtered.push( c )

							// breaking the 2nd loop is causing it to sometimes skip every other result. why??
							//break loop2
						}
					}
				}
			}

			// set filtered data
			this.filtered = filtered
		}

		MPTable.prototype.update = function ( obj, data )
		{
			if ( !obj || !obj.keys )
			{
				return
			}

			var keys = obj.keys()

			var key, myRowId, nextNode, updated, cell

			for ( var i = 0, l = this.data.length; i < l; ++i )
			{
				if ( this.data[ i ].data[ keys[ 0 ] ] !== obj[ keys[ 0 ] ] )
				{
					continue
				}

				for ( key in data )
				{
					this.data[ i ].data[ key ] = data[ key ]

					cell = this.data[ i ].elem.querySelector( '[data-cell-name="' + key + '"]' )

					if ( cell )
					{
						cell.innerHTML = data[ key ]
					}
				}

				updated = true

				// we made it this far... break
				break
			}

			if ( updated )
			{
				// run filter just before sorting
				this.filter()

				this.sort()
			}
		}

		MPTable.prototype.load = function ( force )
		{
			//this.clear()

			var startRow = Math.floor( this.scroll.scrollTop / this.rowHeight )

			// top read-ahead rows
			startRow = _clamp( startRow - this.readAhead, 0, this.filtered.length - 1 )

			var endRow = startRow + Math.ceil( this.tableHeight / this.rowHeight )

			// bottom read-ahead rows
			endRow = _clamp( endRow + this.readAhead, 0, this.filtered.length - 1 )

			// force reload if visible rows have changed
			for ( var i = 0, l = endRow - startRow, n = [], c; i < l; ++i )
			{
				c = this.filtered[ startRow + i ].elem

				if ( !force && c !== this.watching[ i ] )
				{
					force = true
				}

				n.push( c )
			}

			// reset watching array with new watching array
			this.watching = n

			if ( force || startRow !== this.lastStartRow || endRow !== this.lastEndRow )
			{
				this.render( startRow, endRow )
			}

			this.lastStartRow = startRow

			this.lastEndRow = endRow
		}

		MPTable.prototype.fitScroll = function ( forceReload )
		{
			var readAheadPx = this.rowHeight * this.readAhead

			var maxHeight = this.filtered.length * this.rowHeight

			// subtract 1 row from maxHeight
			maxHeight -= this.rowHeight

			var wantedTopHeight = this.scroll.scrollTop

			if ( this.unique )
			{
				wantedTopHeight -= this.rowHeight
			}

			// top read-ahead pixels
			wantedTopHeight -= readAheadPx

			// subtract 1 row from top height
			wantedTopHeight -= this.rowHeight

			var topHeight = _clamp( wantedTopHeight, 0, maxHeight )

			this.spacerTop.style.setProperty( 'height', topHeight )

			var wantedBottomHeight = ( ( this.filtered.length - this.maxRows ) * this.rowHeight ) - topHeight

			// bottom read-ahead pixels
			wantedBottomHeight -= readAheadPx

			var bottomHeight = _clamp( wantedBottomHeight, 0, maxHeight )

			this.spacerBottom.style.setProperty( 'height', bottomHeight )

			this.load( forceReload )

			// stick to bottom if scrolled to the bottom of the table
			/*if ( this.scroll.scrollTop + this.tableHeight - this.rowHeight >= this.scroll.scrollHeight )
			{
				this.scroll.scrollTop = this.scroll.scrollHeight + 20
			}*/
		}

		function getTrFromHTML( html, rowId )
		{
			// create temporary table element
			var temp = DOC.createElement( 'table' )

			// add html to temp element
			temp.innerHTML = html

			// get row from the temp element
			var row = temp.getElementsByTagName( 'tr' )

			// if new row exists, clone it
			var ret = row[ 0 ] ? row[ 0 ].cloneNode( true ) : false

			if ( ret )
			{
				// add row class to cloned element
				ret.classList.add( 'mp-datatable-row' )

				ret.setAttribute( 'data-table-row-id', rowId )
			}

			// remove temporary table element from dom
			temp.remove()

			// return cloned element
			return ret
		}

		MPTable.prototype.addBulk = function ( arr )
		{
			var that = this

			// try not to lock the ui
			WIN.requestAnimationFrame( function ()
				{
					if ( !arr )
					{
						return
					}

					for ( var i = 0, l = arr.length; i < l; ++i )
					{
						that.add( arr[ i ], true )
					}

					// run filter just before sorting
					that.filter()

					// sort after adding
					that.sort()
				}
			)
		}

		MPTable.prototype.processQueue = function ()
		{
			var cd = Date.now()

			if ( this.addQueueArray.length > this.maxInQueue || cd - this.lastProcessQueue > 750 )
			{
				this.addBulk( this.addQueueArray )

				this.addQueueArray = []

				this.lastProcessQueue = cd
			}
		}

		MPTable.prototype.addQueue = function ( data )
		{
			var that = this

			this.addQueueArray.push( data )

			clearTimeout( this.addQueueTimeout )

			this.processQueue()

			this.addQueueTimeout = setTimeout( function ()
				{
					that.processQueue()
				},

				// 1 second
				1000
			)
		}

		MPTable.prototype.deselectAll = function ()
		{
			for ( var i = 0, l = this.selectedRows.length; i < l; ++i )
			{
				this.selectedRows.shift().classList.remove( 'mp-dt-selected-row' )
			}
		}

		MPTable.prototype.selectRow = function ( elem, e )
		{
			e = e || {}

			// remove selected rows if not multi-selecting
			if ( !e.ctrlKey && !e.shiftKey )
			{
				this.deselectAll()
			}

			if ( e.shiftKey )
			{
				// handle shift key multi selection
			}

			else
			{
				var classes = elem.classList

				var i = this.selectedRows.indexOf( elem )

				if ( !classes.contains( 'mp-dt-selected-row' ) )
				{
					classes.add( 'mp-dt-selected-row' )

					if ( i === -1 )
					{
						this.selectedRows.push( elem )
					}
				}

				else

				if ( i > -1 )
				{
					this.selectedRows.splice( i, 1 )

					classes.remove( 'mp-dt-selected-row' )
				}
			}
		}

		MPTable.prototype.add = function ( data, bulk )
		{
			if ( this.unique )
			{
				var dataString = JSON.stringify( data )

				this.songCount.innerText = parseInt( this.songCount.innerText ) + 1

				if ( !this.uniqueRows.hasOwnProperty( dataString ) )
				{
					var obj = {}

					obj.data = data

					if ( !( obj.elem = getTrFromHTML( WIN.mpserver.renderFile( this.name + '-row', data ), this.rowId++ ) ) )
					{
						return
					}

					this.uniqueRows[ dataString ] = obj

					this.data.push( obj )

					this.uniqueCount.innerText = parseInt( this.uniqueCount.innerText ) + 1

					if ( !bulk )
					{
						// run filter just before sorting
						this.filter()

						// sort the array after adding to it
						this.sort()
					}
				}

				else
				{
					var obj = this.uniqueRows[ dataString ]

					var counter = obj.elem.getElementsByClassName( 'mp-dt-unique-count' )

					if ( counter[ 0 ] )
					{
						counter[ 0 ].innerText = parseInt( counter[ 0 ].innerText ) + 1
					}
				}
			}

			else
			{
				var obj = {}

				obj.data = data

				if ( !( obj.elem = getTrFromHTML( WIN.mpserver.renderFile( this.name + '-row', data ), this.rowId++ ) ) )
				{
					return
				}

				this.data.push( obj )

				if ( !bulk )
				{
					// run filter just before sorting
					this.filter()

					// sort the array after adding to it
					this.sort()
				}
			}
		}

		MPTable.prototype.playSong = function ( path )
		{
			if ( path )
			{
				//console.log( path )

				WIN.mpserver.playSong( path )
			}

			else
			{
				// attempt to play the first song available
			}
		}

		// remove all row elements from the table
		MPTable.prototype.clear = function ()
		{
			var rows = this.tbody.getElementsByClassName( 'mp-datatable-row' )

			for ( var i = 0, l = rows.length; i < l; ++i )
			{
				rows[ 0 ].remove()

				// if .remove() causes problems...
				//rows[ 0 ].parentNode.removeChild( rows[ 0 ] )
			}
		}

		MPTable.prototype.render = function ( start, end )
		{
			// 0 minimum start
			start = start >= 0 ? start : 0

			// end limited to the end of this.data array
			end = end < this.filtered.length ? end : this.filtered.length - 1

			// clear old rows
			this.clear()

			// var elem

			for ( ; start <= end; ++start )
			{
				this.tbody.insertBefore( this.filtered[ start ].elem, this.spacerBottom )
			}
		}

		// outsource sort to web worker so the UI does not lock during sort
		// leave it open
		// this directory might not work depending on where it was called, need to test
		// might need to get current directory from node
		var SORTER

		function createSorter()
		{
			var sorter = new Worker( 'lib/javascripts/mptable-sorter.js' )

			sorter.onmessage = function ( e )
			{
				var id = parseInt( e.data.id )

				if ( SORTER_CALLBACKS.hasOwnProperty( id ) )
				{
					SORTER_CALLBACKS[ id ]( e )

					delete SORTER_CALLBACKS[ id ]
				}
			}

			sorter.onerror = function ( e )
			{
				console.log( 'sorter worker process has failed' )

				console.log( e )

				// create a new sorter?

				SORTER.close()

				SORTER = createSorter()
			}

			return sorter
		}

		SORTER = createSorter()

		// uid for each web worker request
		var SORTER_UID = 0

		// store callbacks in here to fire when the web worker responds
		var SORTER_CALLBACKS = {}

		MPTable.prototype.sort = function ()
		{
			var that = this

			var dataToSend = []

			var obj

			var elems = {}

			for ( var i = 0, l = this.filtered.length; i < l; ++i )
			{
				// reset object each iteration
				obj = {}

				// set data
				obj.data = this.filtered[ i ].data

				obj.elemId = parseInt( this.filtered[ i ].elem.getAttribute( 'data-table-row-id' ) )

				elems[ obj.elemId ] = this.filtered[ i ].elem

				dataToSend.push( obj )
			}

			var myId = SORTER_UID++

			SORTER_CALLBACKS[ myId ] = function ( e )
			{
				var newData = []

				var newObj

				for ( i = 0; i < l; ++i )
				{
					newObj = {}

					newObj.data = e.data.data[ i ].data

					newObj.elem = elems[ e.data.data[ i ].elemId ]

					newData.push( newObj )
				}

				// overwrite data with new data
				that.filtered = newData

				// try to prevent memory leaks...
				dataToSend = undefined

				obj = undefined

				newObj = undefined

				elems = undefined

				newData = undefined

				clearTimeout( that.fitTimeout )

				// refit scroll after sorting
				that.fitTimeout = setTimeout( function ()
					{
						that.fitScroll()

						that.lastFit = Date.now()
					},

					200
				)

				var currentTime = Date.now()

				if ( currentTime - that.lastFit >= that.maxFitInterval )
				{
					that.fitScroll()

					that.lastFit = currentTime
				}
			}

			SORTER.postMessage(
				{
					id: myId,

					data: dataToSend,

					order: that.sortOrder
				}
			)
		}

		WIN.MPTable = MPTable
	}
)( window );
