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
		// ignores symbols, the, a, an
		// var ignoreRegex = /^(?!\d)?(?:[\W]|[the|a|an]\s)+/

		// ignores only symbols
		var ignoreRegex = /^(?!\d)?[\W]+/

		function compareFunction( a, b )
		{
			// test for string, make both lowercase and ignore characters
			if ( a.toLowerCase && b.toLowerCase )
			{
				a = a.trim().toLowerCase().replace( ignoreRegex, '' )

				b = b.trim().toLowerCase().replace( ignoreRegex, '' )
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

		self.addEventListener( 'message', function ( e )
			{
				e.data.data.sort( function ( a, b )
					{
						// multi-level sort
						for ( var i = 0, l = e.data.order.length, so, r; i < l; ++i )
						{
							so = e.data.order[ i ]

							// check for descending order
							if ( so.charAt( 0 ) === '-' )
							{
								so = so.substr( 1 )

								// reverse a and b
								r = compareFunction( b.data[ so ], a.data[ so ] )
							}

							else
							{
								r = compareFunction( a.data[ so ], b.data[ so ] )
							}

							// if -1 or 1, return it, otherwise keep looping
							if ( r !== 0 )
							{
								return r
							}
						}

						// attempt to make sort stable
						// compare row id
						return compareFunction( a.elemId, b.elemId )
					}
				)

				// send result to master process
				self.postMessage(
					{
						id: e.data.id,

						data: e.data.data
					}
				)
			},

			false
		)
	}
)();
