var queue = [], httpConnections = 0;

exports.maxConnections = 4;
exports.downloadDirectory = Ti.Filesystem.tempDirectory;
exports.timeout = 30000;

exports.add = function (fileDescriptor)
{
    queue.push(fileDescriptor);
};

exports.remove = function (index)
{
    queue = queue.splice(index, 1);
};

exports.clear = function ()
{
    queue = [];
};

exports.process = function ()
{
    var item, dq = this;
    while (httpConnections < dq.maxConnections && (item = queue.shift()))
    {
        httpConnections++;
        
        var file = Ti.Filesystem.getFile(dq.downloadDirectory + item.filename);
        item.file = file;
        
        var conenction = Ti.Network.createHTTPClient({
            timeout: dq.timeout,
            file: file,

            ondatastream: (function (fileDescriptor)
            {
                return function (event)
                {
                    fileDescriptor.progress(event);
                }
            })(item),

            onload: (function (fileDescriptor)
            {
                return function (event)
                {
                    Ti.fireEvent("downloadqueue:complete", fileDescriptor);
                    httpConnections--;

                    if (dq.queue.length > 0)
                    {
                        dq.process();
                    }
                    else if (httpConnections == 0)
                    {
                        Ti.fireEvent("downloadqueue:queuecomplete", dq);
                    }

                }
            })(item),

            onerror: function (event)
            {
                httpConnections--;
                Ti.API.error("Failed to download");
            }
        });
        
        conenction.open("GET", item.url);
        conenction.send();
    }
};