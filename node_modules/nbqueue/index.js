/** nodebee queue class
 *  2014 kevin von flotow
 *
 *  executes functions passed to the instance.
 *  if maxProcesses is exceeded, it will wait for
 *  running processes to finish before executing
 *
 *  basically, this limits the number of async
 *  functions that are running at any given time
 */
( function ()
    {
        function doDone()
        {
            if ( this.doneFn && this.processes === 1 && this.queue.length === 0 )
            {
                this.doneFn( this.errors.length !== 0 ? this.errors : null, this.results )
            }
        }

        function nextQueue( err, result )
        {
            this.processes--

            err && this.errors.push( err )

            typeof result !== 'undefined' && this.results.push( result )

            processQueue.call( this )
        }

        function processQueue()
        {
            // return if queue is empty
            if ( this.queue.length === 0 )
            {
                doDone.call( this )

                return
            }

            if ( !this.maxProcesses || this.processes <= this.maxProcesses )
            {
                this.processes++

                // shift and execute, pass nextQueue
                this.queue.shift()( nextQueue.bind( this ) )
            }
        }

        /** @constructor */
        function Queue( maxProcesses )
        {
            // max simultaneous processes, if this is exceeded they will be queued
            // default is currently unlimited
            this.maxProcesses = maxProcesses

            // begin processes at 1
            this.processes = 1

            this.queue = []

            this.doneFn = null

            this.errors = []

            this.results = []
        }

        Queue.prototype.add = function ( fn )
        {
            this.queue.push( fn )

            processQueue.call( this )

            return this
        }

        Queue.prototype.done = function ( fn )
        {
            this.doneFn = fn

            doDone.call( this )
        }

        module.exports = Queue
    }
)()
