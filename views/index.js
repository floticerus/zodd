// tracks all of the ejs views in the current directory
;( function ()
	{
		var FS = require( 'fs' )

		var PATH = require( 'path' )

		var EJS_REGEX = /^(.*?)\.ejs$/

		FS.readdirSync( __dirname ).forEach( function ( file )
			{
				var matches = file.match( EJS_REGEX )

				if ( matches && matches.length !== 0 )
				{
					// load the template into memory
					exports[ matches[ 1 ] ] = FS.readFileSync( PATH.join( __dirname, file ), { encoding: 'utf8' } )
				}
			}
		)
	}
)();
