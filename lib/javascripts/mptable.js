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

			this.data = []

			this.elem = elem

			this.name = elem.getAttribute( 'data-table' )

			this.sortOrder = ( elem.getAttribute( 'data-table-sort' ) || '' ).toString().split( ' ' )

			var firstRow = this.tables[ 1 ].getElementsByClassName( 'mp-dt-first-row' )

			if ( !firstRow[ 0 ] )
			{
				return
			}

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

			if ( this.unique = elem.getAttribute( 'data-table-unique' ) === 'true' )
			{
				this.uniqueRows = {}

				this.rowSpacing = 2
			}

			var thead = elem.getElementsByTagName( 'thead' )

			this.thead = thead[ 0 ] ? thead[ 0 ] : null

			this.th = this.thead.getElementsByTagName( 'th' )

			var tbody = elem.getElementsByTagName( 'tbody' )

			this.tbody = tbody[ 0 ] ? tbody[ 0 ] : null

			this.firstRowTd = this.firstRow.getElementsByTagName( 'td' )

			var tscroll = elem.getElementsByClassName( 'mp-scroll' )

			this.scroll = tscroll[ 0 ] ? tscroll[ 0 ] : null

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

							// sort the table
							that.sort()
						}
					)
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

			//this.maxRows += this.readAhead * 2

			for ( var i = 0, l = this.firstRowTd.length; i < l; ++i )
			{
				this.firstRowTd[ i ].style.setProperty( 'width', parseFloat( WIN.getComputedStyle( this.th[ i ], null ).getPropertyValue( 'width' ) ) + 1 )
			}

			this.fitScroll()
		}

		MPTable.prototype.load = function ( force )
		{
			//this.clear()

			var startRow = Math.floor( this.scroll.scrollTop / this.rowHeight )

			// top read-ahead rows
			startRow = _clamp( startRow - this.readAhead, 0, this.data.length - 1 )

			var endRow = startRow + Math.ceil( this.tableHeight / this.rowHeight )

			// bottom read-ahead rows
			endRow = _clamp( endRow + this.readAhead, 0, this.data.length - 1 )

			// force reload if visible rows have changed
			for ( var i = 0, l = endRow - startRow, n = [], c; i < l; ++i )
			{
				c = this.data[ startRow + i ].elem

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
			var that = this

			var readAheadPx = that.rowHeight * that.readAhead

			var maxHeight = that.data.length * that.rowHeight

			// subtract 1 row from maxHeight
			maxHeight -= this.rowHeight

			var wantedTopHeight = that.scroll.scrollTop

			if ( that.unique )
			{
				wantedTopHeight -= that.rowHeight
			}

			// top read-ahead pixels
			wantedTopHeight -= readAheadPx

			// subtract 1 row from top height
			wantedTopHeight -= this.rowHeight

			var topHeight = _clamp( wantedTopHeight, 0, maxHeight )

			that.spacerTop.style.setProperty( 'height', topHeight )

			var wantedBottomHeight = ( ( that.data.length - that.maxRows ) * that.rowHeight ) - topHeight

			// bottom read-ahead pixels
			wantedBottomHeight -= readAheadPx

			var bottomHeight = _clamp( wantedBottomHeight, 0, maxHeight )

			that.spacerBottom.style.setProperty( 'height', bottomHeight )

			that.load( forceReload )

			// stick to bottom if scrolled to the bottom of the table
			/*if ( this.scroll.scrollTop + this.tableHeight - this.rowHeight >= this.scroll.scrollHeight )
			{
				this.scroll.scrollTop = this.scroll.scrollHeight + 20
			}*/
		}

		function getTrFromHTML( html )
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
			}

			// remove temporary table element from dom
			temp.remove()

			// return cloned element
			return ret
		}

		MPTable.prototype.addBulk = function ( arr )
		{
			if ( !arr )
			{
				return
			}

			for ( var i = 0, l = arr.length; i < l; ++i )
			{
				this.add( arr[ i ], true )
			}

			// sort after adding
			this.sort()
		}

		MPTable.prototype.processQueue = function ()
		{
			var l = this.addQueueArray.length

			var cd = Date.now()

			if ( l > this.maxInQueue || cd - this.lastProcessQueue > 1250 )
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

				// 1.5 seconds
				1500
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

				if ( !this.uniqueRows.hasOwnProperty( dataString ) )
				{
					var obj = {}

					obj.data = data

					if ( !( obj.elem = getTrFromHTML( WIN.mpserver.renderFile( this.name + '-row', data ) ) ) )
					{
						return
					}

					var that = this

					obj.elem.addEventListener( 'click', function ( e )
						{
							that.selectRow( obj.elem, e )
						}
					)

					//obj.elem.setAttribute( 'data-table-row-index', this.data.length )

					var counter = obj.elem.getElementsByClassName( 'mp-dt-unique-count' )

					if ( counter[ 0 ] )
					{
						obj.counter = counter[ 0 ]
					}

					obj.count = 1

					this.uniqueRows[ dataString ] = true

					this.data.push( obj )

					if ( !bulk )
					{
						// sort the array after adding to it
						this.sort()
					}
				}

				else
				{
					/* var existing = this.data[ this.uniqueRows[ dataString ] ]

					existing.count++

					if ( existing.counter )
					{
						existing.counter.innerText = existing.count.toString()
					} */
				}
			}

			else
			{
				var obj = {}

				obj.data = data

				if ( !( obj.elem = getTrFromHTML( WIN.mpserver.renderFile( this.name + '-row', data ) ) ) )
				{
					return
				}

				var that = this

				obj.elem.addEventListener( 'click', function ( e )
					{
						that.selectRow( obj.elem, e )
					}
				)

				//obj.elem.setAttribute( 'data-song-path', data.path )

				if ( data.path )
				{
					obj.elem.addEventListener( 'dblclick', function ()
						{
							that.playSong( data.path )
						}
					)
				}

				//obj.elem.setAttribute( 'data-table-row-index', this.data.length )

				this.data.push( obj )

				if ( !bulk )
				{
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
			end = end < this.data.length ? end : this.data.length - 1

			// clear old rows
			this.clear()

			// var elem

			for ( ; start <= end; ++start )
			{
				//elem = this.data[ start ].elem

				//elem.setAttribute( 'data-table-row-index', this.data.length )

				this.tbody.insertBefore( this.data[ start ].elem, this.spacerBottom )
			}
		}

		var numRegex = /^(\d+)$/

		function compareFunction( a, b )
		{
			a = a.toString()

			b = b.toString()

			//var aNumMatch = a.match( numRegex )

			//var bNumMatch = b.match( numRegex )

			if ( numRegex.test( a ) && numRegex.test( b ) )
			{
				a = parseInt( a )

				b = parseInt( b )
			}

			else if ( a.toLowerCase && b.toLowerCase )
			{
				a = a.toLowerCase()

				b = b.toLowerCase()
			}

			if ( a < b )
			{
				return -1
			}

			else if ( a > b )
			{
				return 1
			}

			return 0
		}

		MPTable.prototype.sort = function ()
		{
			var that = this

			var forceReload = false

			var tBodyChildren = that.tbody.children

			this.data.sort( function ( a, b )
				{
					var i = 0

					var l = that.sortOrder.length

					// variables to reuse within loop
					var so, sa, sb, r

					var ai = Array.prototype.indexOf.call( tBodyChildren, a.elem )

					var bi = Array.prototype.indexOf.call( tBodyChildren, b.elem )

					// multi-level sort
					for ( ; i < l; ++i )
					{
						so = that.sortOrder[ i ]

						// check for descending order
						if ( so.charAt( 0 ) === '-' )
						{
							so = so.substr( 1 )

							// reverse a and b
							sa = b.data[ so ]

							sb = a.data[ so ]
						}

						else
						{
							sa = a.data[ so ]

							sb = b.data[ so ]
						}

						// get result for this level
						r = compareFunction( sa, sb )

						// if -1 or 1, return it, otherwise keep looping
						if ( r !== 0 )
						{
							return r
						}
					}

					// attempt to make sort stable
					// compare original position of both elements
					return compareFunction( ai, bi )
				}
			)

			// if visible items were sorted, set true
			//var forceReload = false

			//this.fitScroll( false )

			var that = this

			clearTimeout( this.fitTimeout )

			// refit scroll after sorting
			this.fitTimeout = setTimeout( function ()
				{
					that.fitScroll()

					that.lastFit = Date.now()
				},

				200
			)

			var currentTime = Date.now()

			//console.log( currentTime - this.lastFit >= this.maxFitInterval )

			if ( currentTime - this.lastFit >= this.maxFitInterval )
			{
				this.fitScroll()

				this.lastFit = currentTime
			}
		}

		WIN.MPTable = MPTable
	}
)( window );
