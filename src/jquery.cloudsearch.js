(function ($) {

    //Defaults - Local Settings
    var ls = {
        cloudSearch: {
            url: "",
            key: ""
        },
        googleGeocodeApi: {
            key: null,
            url: "https://maps.googleapis.com/maps/api/geocode/json",
            language: 'en'
        },
        geoSearch: {
            lat: null,
            lng: null,
            fieldName: '_distance',
            cloudFieldName: null,
            unit: 'K',
            maxDistance: null
        },
        searchParams: {
            q: "matchall",
            return: "_all_fields",
            size: 10, // page size
            sort: "_score desc",
            start: 0, // offset starting result (pagination)
            "q.parser" : "structured",
        },
        dates: {
            hasDates: false,
            fields: {
                zone: 'EST',
                from: {
                    cloudSearchField: null,
                    fieldId: null
                },
                to: {
                    cloudSearchField: null,
                    fieldId: null
                }
            }
        },
        facets: {       
            facet: '<a href=\"#\"/>',
            facetClass: 'facet',
            titleWrapper: "<h2/>",
            title: "<a href=\"#\"/>",
            titleClass: "",
            titleOnClick: function () { },
            titleWrapperClass: "facet-title",
            container: "#facets",
            wrapperContainer: "<ul/>",
            wrapperContainerClass: "facet-list",
            wrapper: "<li/>",
            wrapperClass: "facet-item",
            showCount: true,
            countWrapper: null,
            countWrapperClass: null,
            facetOnClick: defaultFacetChange,
            searchMode: 'and',
            onFacetSelect: defaultFacetSelect,
            groupWrapper: '<div/>',
            groupWrapperClass: 'group',
        },
        facetsApplied: {
            container: null,
            class: 'selected-facet',
            // fieldParams: ,
            extraAttributes: {},
            ignoreFacets: [],
            clearAll: {
                enabled: true,
                label: 'Clear all',
                className: '',                
            },  
            onChange: function () { }
        },
        facetsDictionary: null,
        //Array containing facetname|facetvalue
        facetsSelected: [],
        results: {
            container: '#results',
            template: null,
            noResults: 'Sorry there are no results for your query',
            noResultsClasses: '',
            onCreate: function () { },
            loaderContainer: null,
            pager: {
                container: null,
                loadMore: true,
                appendPager: false,
                pagerRangeIncrement: 5,
                enders: true,
                updateHistory: false,
                labels: {
                    prev: 'Previous',
                    next: 'Next',
                    first: 'First',
                    last: 'Last',
                    results: 'results for',
                    load: 'load more',
                    ada: {
                        current: 'You are on page',
                        item: 'Go to page',
                        prev: 'Go to the previous page of results',
                        next: 'Go to the next page of results',
                        first: 'Go to the first page of results',
                        last: 'Go to the last page of results',
                        load: 'Load more results'
                    }
                },
                onRender: function () { },
                onPageChange: function () { },
            },
        },
        urlParameters: {
            address: 'a',
            latitude: 'l',
            longitude: 'ln',
            latlong: null,
            search: 'q',
            page: 'p',
        },
        onResults: processResults,
        onLoad: function () { },
        debug: false
    };

    //Internal Parameters
    var local = {
        container: null,
        totalPages: 0,
        currentPage: 1,
        pagerRange: [],
        pagerRendered: false,
        waitingLatLong: false,
        isGeoSearch: false,
        totalResults: 0,
        initialized: false,
        rendered: false,
        fromDate: null,
        toDate: null,
        clearAllAdded: false,
    }

    /**
     * jQuuery Plugin Definition
     */

    $.fn.cloudsearch = function (options, action) {

        local.container = this;

        if (!action)
            action = 'search';

        if (options) {
            //Default options.

            if (options.cloudSearch)
                options.cloudSearch = $.extend(ls.cloudSearch, options.cloudSearch);
            if (options.googleGeocodeApi)
                options.googleGeocodeApi = $.extend(ls.googleGeocodeApi, options.googleGeocodeApi);
            if (options.geoSearch)
                options.geoSearch = $.extend(ls.geoSearch, options.geoSearch);
            if (options.searchParms)
                options.searchParms = $.extend(ls.searchParms, options.searchParms);
            if (options.dates)
                options.dates = $.extend(true, ls.dates, options.dates);
            if (options.facets)
                options.facets = $.extend(ls.facets, options.facets);
            if (options.facetsApplied)
                options.facetsApplied = $.extend(true, ls.facetsApplied, options.facetsApplied);
            if (options.results)
                options.results = $.extend(true, ls.results, options.results);
            if (options.urlParameters)
                options.urlParameters = $.extend(ls.urlParameters, options.urlParameters);

            ls = $.extend(ls, options);

            checkUrlParameters();
        }

        if (!local.initialized) {
            //Check active facets
            $(ls.facetsSelected).each(function (i, v) {
                ls.facets.onFacetSelect.call([v]);
            });
        }

        if(ls.dates.hasDates) {
            setupDateFields();
        }

        switch (action) {
            case "search":
                search();
                break;
            case "resetFacets":
                ls.facetsSelected = [];
                ls.facets.onFacetSelect.call(ls.facetsSelected);
                search();
                break;
        }

        local.initialized = true;

        // return
        return this;

    };

    /**
     * Handlers
     */

    function processResults() {
        var data = this;

        loadFacets(data);
        loadResults(data);
        // render pager  
        if(data['hits']['found'] > ls.searchParams.size) {
            renderPager(data);
        }    
        ls.onLoad.call(data, local);
    }

    //Default action when a facet receives a click
    function defaultFacetChange(e) {
        e.preventDefault();

        var value = $(this).data('cloudsearchFacetName') + '||' + $(this).data('cloudsearchFacetValue');
        
        if(e.target.nodeName == 'SELECT') {
            value = $(this).data('cloudsearchFacetName') + '||' + $(this).val();
        }

        if (ls.facetsSelected.indexOf(value) != -1)
            return;
        ls.searchParams.start = 0;
        local.currentPage = 1;
        ls.facetsSelected.push(value);             
        ls.facetsApplied.onChange.call(ls.facetsSelected.slice(0));    
        ls.facets.onFacetSelect.call(ls.facetsSelected.slice(0));        
        /*    
        */
        search();
    }

    //Default action when a facet is selected
    function defaultFacetSelect() {

        var sfs = ls.facetsApplied;

        if (!sfs.container)
            return;

        var lastFacet = this.pop();
        var c = $(sfs.container);
        // console.log()
        var fs = lastFacet.split('||');
        
        //Ignore if necessary
        if (sfs.ignoreFacets.indexOf(fs[0]) != -1)
            return;

        $('<a/>').text(fs[1])
            .attr({ 'href': '#' })
            .attr(sfs.extraAttributes)
            .data('value', lastFacet)
            .addClass(sfs.class)
            .on('click', function (e) {
                e.preventDefault();
                ls.facetsSelected
                    .splice(
                        ls.facetsSelected.indexOf($(this).data('value')), 1
                    );
                ls.searchParams.start = 0;
                local.currentPage = 1;
                ls.facetsApplied.onChange.call(ls.facetsSelected);
                $(this).remove();
                if(!(c.children().not('.clear-all-facets').length > 0)) {            
                    c.hide();
                }                 
                search();
            })
            .appendTo(c);
        // clearAll
        if(sfs.clearAll.enabled && !local.clearAllAdded) {
            $('<a/>').text(sfs.clearAll.label)
            .attr({ 'href': '#' })
            .attr(sfs.extraAttributes)
            .addClass('clear-all-facets')
            .addClass(sfs.class)
            .addClass(sfs.clearAll.className)
            .on('click', function (e) {
                e.preventDefault();
                local.clearAllAdded = false;
                c.empty().hide();
                ls.facetsSelected.length = 0;
                ls.searchParams.start = 0;
                local.currentPage = 1;
                ls.facetsApplied.onChange.call(ls.facetsSelected);
                
                search();                
            })
            .prependTo(c);
            local.clearAllAdded = true;
        }

        c.show();

    }

    function processAddress(data) {
        debug('Google Geocode return:');
        debug(data);

        var ret = null;

        if (data.status == "OK" && data.results.length > 0) {
            ls.geoSearch.lat = data.results[0].geometry.location.lat;
            ls.geoSearch.lng = data.results[0].geometry.location.lng;
        }

        local.waitingLatLong = false;
        search();
    }


    /**
     * Content Functions
     */

    //Display the results
    function loadResults(data) {

        var rs = ls.results;
        var ldr = $(rs.loaderContainer);
        var c = $(rs.container) ? $(rs.container) : $(local.container);
        
        if (!c || !data["hits"]["hit"])
            return;
        //Clear the container if skip is 0 or if the clear is forced by setting
        if (!rs.pager.loadMore || ls.searchParams.skip == 0)
            c.html('');
        
        if(data["hits"]['found'] == 0) {

            // hide Loader
            if(ldr)
                ldr.fadeOut();
            $('<div/>').addClass('cloudsearch-no-results ' + rs.noResultsClasses).text(rs.noResults).appendTo(c);
        }

        $(data["hits"]["hit"]).each(function (i, v) {

            var fields = v["fields"];
            //Populate the results
            if (!rs.template) {
                //Without a template, just display all the fields with some content
                var l = $('<ul/>')
                var hr = $('<hr/>');

                $(Object.keys(fields)).each(function (j, k) {
                    if (!fields[k] || fields[k] == '')
                        return true;
                    var item = $('<li/>').text(k + " : ").appendTo(l);
                    $('<strong/>').text(fields[k]).appendTo(item);
                });
                l.appendTo(c);
                hr.appendTo(c);

                //Callback on create
                rs.onCreate.call(l);
            } else {
                //With template
                var t = $(rs.template);
                $(':not([data-cloudsearch-field=""])', t).not().each(function (y, z) {

                    var field = $(z).data('cloudsearchField');
                    var value = '';

                    if (field && v["fields"][field]) {
                        value = v["fields"][field];
                    } else if (field == ls.geoSearch.fieldName && local.isGeoSearch) {
                        if (v[ls.geoSearch.cloudFieldName]) {
                            var geo = v[ls.geoSearch.cloudFieldName];
                            value = distance(
                                ls.geoSearch.lat, ls.geoSearch.lng,
                                geo.coordinates[1], geo.coordinates[0],
                                ls.geoSearch.unit);
                        }
                    }

                    //Format the data using the provided Callback function
                    var format = $(z).data('cloudsearchValueFormat');
                    if (format && window[format])
                        value = window[format](value, v);

                    if (field) {                        
                        if(typeof $(z).data('cloudsearchValueFormatReplace') !== 'undefined') {
                            $(z).replaceWith(value);
                        } else {
                            $(z).html(value);
                        }
                    }
                });
                c.append(t);
                if(ldr)
                    ldr.fadeOut();
                //Callback on create
                rs.onCreate.call(t);
            }
        });
        local.rendered = true;
    }

    /**
     * 
     * @param {*} data 
     */
    function renderPager(data) {
        
        var pg = ls.results.pager;
        
        if (pg.appendPager) {            
                              
            var pg_c = $(pg.container);
            pg_c.empty();
            if (!local.pagerRendered) {

                local.pagerRange[0] = 1;
                local.pagerRange[1] = pg.pagerRangeIncrement 

                if(local.currentPage >= pg.pagerRangeIncrement) {
                    local.pagerRange[0] = Math.floor(local.currentPage/pg.pagerRangeIncrement) * pg.pagerRangeIncrement;
                    local.pagerRange[1] = (Math.floor(local.currentPage/pg.pagerRangeIncrement) + 1) * pg.pagerRangeIncrement;
                }

            }
            generatePagerLinks();

            pg_c.fadeIn();
            local.pagerRendered = true;
        }        
    }

    /**
     * 
     */
    function generatePagerLinks() {

        var pg = ls.results.pager;
        var c = $(pg.container);

        if (!c)
            return;

        if(pg.loadMore) {
            
            c.append(addPagerButton('load'));
            
        } else {         

            var items;
            if(pg.enders) {
                c.append(addPagerButton('first'));
            }
            c.append(addPagerButton('prev'));

            if(!local.pagerRendered) {
                items = $('<div/>').addClass('pager-nav-items');
            } else {
                items = $('.pager-nav-items').empty();
            }

            var i = local.pagerRange[0];
            while(i <= local.pagerRange[1] && i <= local.totalPages) {
                var pagerLink = $('<a href="#">').data('targetPage',i);
                if(i === local.currentPage) {
                    pagerLink = $('<span></span>');
                    pagerLink.attr('title', pg.labels.ada.current + ' ' + i);
                } else {
                    pagerLink.attr('title', pg.labels.ada.item + ' ' + i);
                }
                pagerLink.text(i);
                items.append(pagerLink);
                i++;
            }

            if( !c ) {                
                c.append(addPagerButton('next'));
                if(pg.enders) {
                    c.append(addPagerButton('last'));
                }
                $(local.container).after(c)
            } else {
                c.append(items);            
                c.append(addPagerButton('next'));
                if(pg.enders) {
                    c.append(addPagerButton('last'));
                }
            } 

        }

        if(!local.pagerRendered) {
            addPagerListeners();
        }

        // c;
    };

    /**
     * 
     * @param {*} type 
     */
    function addPagerButton(type) {

        var pg = ls.results.pager;
        var button = $('<a/>').text(pg.labels[type]).addClass('pager-navs').addClass('pager-' + type).attr('href','#').attr('title', pg.labels.ada[type]);

        if(type == 'first') {
            button.data('targetPage', 1);
        } else if (type == 'last') {
            button.data('targetPage', local.totalPages);
        }

        //button;
        if(local.pagerRendered) {
            button = $('.pager-navs.pager-' + type);
        }
        
        if (type == 'prev' || type == 'first') {
            if (local.currentPage > 1) {
                button.data('disabled', false).removeClass('disabled');
            } else {
                button.data('disabled', true).addClass('disabled');
            }
        } else {
            if(local.totalPages > local.currentPage) {
                button.data('disabled', false).removeClass('disabled');
            }  else {
                button.data('disabled', true).addClass('disabled');
            }        
        }

        return button;

    }

    /**
     * 
     */
    function addPagerListeners() {

        $('.pager-prev, .pager-next, .pager-load').on('click', function(e){
            e.preventDefault();
            if( !$(this).data('disabled') ) {
                handlePager($(this).hasClass('pager-prev'));
            }
        });

        $('.pager-last, .pager-first').on('click', function(e){
            e.preventDefault();
            if( !$(this).data('disabled') ) {                
                skipToPage($(this).data('targetPage'));
            }
        });

        $('.pager-nav-items a').on('click',function(e){
            e.preventDefault();
            skipToPage($(this).data('targetPage'));
        });
    }

    /**
     * 
     * @param {*} next 
     */
    function handlePager(next) {
        var pg = ls.results.pager; 

        if(ls.searchParams.size && local.currentPage && local.rendered) {        
            local.rendered = false;                
            // go to next page of results
            if(!next) {
                local.currentPage = local.currentPage + 1;
            } else {
                local.currentPage = local.currentPage - 1;
            }
            
            ls.searchParams.start = (local.currentPage - 1) * ls.searchParams.size;         
            search();
        }
    }

    /**
     * 
     * @param {*} num 
     */
    function skipToPage(num) {
        local.currentPage = num;
        ls.searchParams.start = (local.currentPage - 1) * ls.searchParams.size;       
        search();            
    }

    //Load the facets according to the results
    function loadFacets(data) {
        var fs = ls.facets;
        var c = $(fs.container);

        //Check if the containers was defiend and if the facets were part of the results
        if (!c || !data["facets"])
            return;

        c.html('');

        $(Object.keys(ls.facetsDictionary)).each(function (i, v) {
       
       
            if (data["facets"][v]) {

                //Facet's Title
                var tt = v;
                if(typeof ls.facetsDictionary[v] == 'object' && ls.facetsDictionary[v].label) {
                    tt = ls.facetsDictionary[v].label;
                } else if(ls.facetsDictionary && ls.facetsDictionary[v]) {
                    tt = ls.facetsDictionary[v];
                }

                var title = $(fs.title).addClass(fs.titleClass).text(tt);

                if (fs.titleWrapper) {
                    title = $(fs.titleWrapper).addClass(fs.titleWrapperClass).append(title);
                }
                
                c.append(title);

                title.on('click', fs.titleOnClick);

                //Facets container
                var w = $(fs.wrapperContainer).addClass(fs.wrapperContainerClass);        
                c.append(w);
                
                if(typeof ls.facetsDictionary[v] == 'object' && ls.facetsDictionary[v].dropdown) {
                    renderFacetSelect(w, title, data, v);
                }
                else {
                    renderFacetList(w, title, data, v);
                }

            }


        });
    }

    // render facet as dropdown select instead
    // of links
    function renderFacetSelect(w, title, data, v) {
        var fs = ls.facets;
        var c = $(fs.container);

        var control = $('<select />')
        .data('cloudsearchFacetName', v)
        .on('change', fs.facetOnClick).append($('<option />').text('Select'));
        w.append(control);
        var countFacets = 0;

        //Facets
        $(data["facets"][v]['buckets']).each(function (j, k) {

            //Create the facet
            var f = $('<option />')
                // .addClass(fs.facetClass)
                .text(k.value)
                .attr('value', k.value);

            //Counter
            if (fs.showCount) {
                f.text(f.text() + " (" + k.count + ")");
            }
            
            //Do not display selected facets
            if (ls.facetsSelected.indexOf(v + '||' + k.value) != -1) {
                f.attr("selected","selected");
            }            
            control.append(f);

            countFacets++;
        });

         //Group Wrapper
         if (fs.groupWrapper && countFacets > 0) {
            var gw = $(fs.groupWrapper).addClass(fs.groupWrapperClass);
            c.append(gw);
            title.appendTo(gw);
            w.appendTo(gw);
        }

        if (countFacets == 0) {
            title.remove();
            w.remove();
        }
    }

    // render facet list as links
    function renderFacetList(w, title, data, v) {
        var fs = ls.facets;
        var c = $(fs.container);

        var countFacets = 0;

        //Facets
        $(data["facets"][v]['buckets']).each(function (j, k) {

            //Create the facet
            var f = $(fs.facet)
                .addClass(fs.facetClass)
                .html(k.value)
                .on('click', fs.facetOnClick)
                .data('cloudsearchFacetName', v)
                .data('cloudsearchFacetValue', k.value);

            //Counter
            if (fs.showCount && ls.facets.countWrapper) {
                $(ls.facets.countWrapper)
                    .text("(" + k.count + ")")
                    .addClass(ls.facets.countWrapperClass)
                    .appendTo(f);
            } else if (fs.showCount) {
                f.append(" (" + k.count + ")");
            }

            //Do not display selected facets
            if (ls.facetsSelected.indexOf(v + '||' + k.value) != -1) {
                f.addClass('active-facet');
            }

            if (fs.wrapper)
                $(fs.wrapper).addClass(fs.wrapperClass).append(f).appendTo(w);
            else
                w.append(f);

            countFacets++;
        });
        
        //Group Wrapper
        if (fs.groupWrapper && countFacets > 0) {
            var gw = $(fs.groupWrapper).addClass(fs.groupWrapperClass);
            c.append(gw);
            title.appendTo(gw);
            w.appendTo(gw);
        }

        if (countFacets == 0) {
            title.remove();
            w.remove();
        }

    }

    /**
     * Setup Date fields to filter results
     * based on a date range
     */
    function setupDateFields() {
        
        var df = ls.dates.fields;

        if(!df.from.selector || !df.from.cloudSearchField)
            return;
        
        var fs = df.from.selector;

        if(df.to.selector && df.to.cloudSearchField && df.from.selector) {
            fs += ', ' + df.to.selector;
        } else if(df.to.selector && df.to.cloudSearchField ) {
            fs = df.to.selector;
        }

        $(fs).on('change', function(e) {
            handleDateInput( $(this).val(), $(this).data('dateDir'));
        });

        
        $(fs).on('keydown', function (e) {
            // search on return press
            if(e.which === 13){
                e.preventDefault();
                handleDateInput( $(this).val(), $(this).data('dateDir'));
            } 
            // clear field and search on backspace/delete
            else if(e.which == 8 || e.which == 46) {
                e.preventDefault();
                $(this).val('');
                handleDateInput( $(this).val(), $(this).data('dateDir'));
            }
        });

        function handleDateInput(val,dir) {
            local[dir] = null;
            if(val && dir) {
                val = df.zone ? val + " " + df.zone : val;
                var dateObj = new Date(val);
                local[dir] = dateObj;
            } 

            if(local.fromDate || local.toDate) {
                local.dateSearch = true;
            } else {
                local.dateSearch = false;
            }
            ls.searchParams.start = 0;
            local.currentPage = 1;
            search();
        }
        
    }

    /**
     * External API Calls
     */

    //Execute the AJAX call to AWS Cloud Search
    function search() {

        if (ls.results.pager.updateHistory) {
            updatePageHistory();
        }



        local.isGeoSearch = false;

        // show Loader
        if (ls.results.loaderContainer)
            $(ls.results.loaderContainer).fadeIn();

        // remove pager
        if (ls.results.pager.container)
            $(ls.results.pager.container).empty().fadeOut();
        local.pagerRendered = false;

        if (local.waitingLatLong)
            return;

        //Check if it's geo search
        if (ls.geoSearch.lat && ls.geoSearch.lng) {
            debug('Geo searching...');
            debug(ls.geoSearch.lat);
            debug(ls.geoSearch.lng);
            local.isGeoSearch = true;
            if (!ls.searchParams.orderby || ls.searchParams.orderby.indexOf(ls.geoSearch.fieldName) == 0) {
                var orderby = "geo.distance(" + ls.geoSearch.cloudFieldName;
                orderby += ", geography'POINT(" + ls.geoSearch.lng + " " + ls.geoSearch.lat + ")')";
                if (ls.searchParams.orderby && ls.searchParams.orderby.indexOf(' desc') != -1) orderby += ' desc';
                ls.searchParams.orderby = orderby;
            }
        }

        var f = null;
        //Save the current filter

        var previousFilter = ls.searchParams.fq;
        
        if( ls.facetsDictionary ) {
            $(Object.keys(ls.facetsDictionary)).each(function(k,v){
                var fieldParams = '{}';
                if(typeof ls.facetsDictionary[v] == 'object' && ls.facetsDictionary[v].params) 
                    fieldParams = ls.facetsDictionary[v].params;
                ls.searchParams['facet.'+v] = fieldParams;                
            });
        }

        //Apply Facet Filters
        if (ls.facetsSelected.length > 0) {
            var facetFilter = [];
            ls.facetsSelected.forEach(function (item, index) {
                var p = item.split('||');
                // apply filter and escape single quotes in value (')
                facetFilter.push('' + p[0] + ': \'' + p[1].replace(/[']/gi, "\\'") + '\'');
            });

            f = facetFilter.join(' ');
        }

        //Apply geo distance filter if configured
        // if (local.isGeoSearch && ls.geoSearch.maxDistance) {
        //     debug('Filter Geo searching by distance : ' + ls.geoSearch.maxDistance);
        //     var geoFilter = "geo.distance(" + ls.geoSearch.cloudFieldName + ", geography'POINT(" + ls.geoSearch.lng + " " + ls.geoSearch.lat + ")') le " + ls.geoSearch.maxDistance;
        //     if (f) {
        //         f += ' and ' + geoFilter
        //     } else {
        //         f = geoFilter;
        //     }
        // }

        var date_f = "";
        if(local.dateSearch) {
            if(local.fromDate) {
                date_f = ls.dates.fields.from.cloudSearchField + ": ['" + local.fromDate.toISOString() + "'";           
            } 

            if(local.toDate && ls.dates.fields.from.cloudSearchField == ls.dates.fields.to.cloudSearchField) {
                if(!local.fromDate) {
                    date_f += ls.dates.fields.to.cloudSearchField + ":{"; 
                }
                date_f += ",'" + local.toDate.toISOString() + "']";
            } else if(local.toDate) {
                if(local.fromDate) {
                    date_f += ",} "; 
                }
                date_f += ls.dates.fields.to.cloudSearchField + ":{"; 
                date_f += ",'" + local.toDate.toISOString() + "']";                
            } else if(local.fromDate) {
                date_f += ",}"; 
            }            

            if (f) {
                f += " " + date_f;
            } else {
                f = date_f;
            }
        }

        if (f) {
            if(previousFilter) {
                f = '(' + ls.facets.searchMode + ' ' + previousFilter + ' ' + f + ')';
            } else {
                f = '(' + ls.facets.searchMode + ' ' + f + ')'
            }
            ls.searchParams.fq = f;
        }


        var settings = {
            "crossDomain": true,
            "url": ls.cloudSearch.url,
            "method": "GET",
            "headers": {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "X-Api-Key": ls.cloudSearch.key,
                "Cache-Control": "no-cache",
            },
            "data": ls.searchParams
        };

        $.ajax(settings).done(function (response) {
            if(response.hits) {
                local.totalResults = response.hits.found > 0 ? response.hits.found : -1;
                local.totalPages = Math.ceil(local.totalResults / ls.searchParams.size);
                ls.onResults.call(response, local);
            }
            else if(response.error) {
                debug(response.error);
            }
         });

        //Return the filter to the original state
        ls.searchParams.fq = previousFilter;
    }



    // resolve address text to Lat/Lng values from geocoding api

    function resolveAddress(address) {
        var s = ls.googleGeocodeApi;

        if (!s.key)
            return;

        local.waitingLatLong = true;

        //Key
        var url = s.url;
        url += url.indexOf('?') != -1 ? '&' : '?';
        url += 'key=' + s.key;
        url += '&address=' + address;
        url += '&language=' + s.language;

        $.getJSON(url, processAddress);
    }

    /**
     * Utility Functions
     */

    //Calculate the distance between two geo points
    function distance(lat1, lon1, lat2, lon2, unit) {

        var radlat1 = Math.PI * lat1 / 180
        var radlat2 = Math.PI * lat2 / 180
        var theta = lon1 - lon2
        var radtheta = Math.PI * theta / 180
        var dist = Math.sin(radlat1) * Math.sin(radlat2) + Math.cos(radlat1) * Math.cos(radlat2) * Math.cos(radtheta);
        if (dist > 1) {
            dist = 1;
        }
        dist = Math.acos(dist)
        dist = dist * 180 / Math.PI
        dist = dist * 60 * 1.1515
        if (unit == "K") { dist = dist * 1.609344 }
        if (unit == "N") { dist = dist * 0.8684 }
        return dist;
    }

    // Log messages to console when debug enabled.
    function debug(obj) {
        if (ls.debug && window.console && window.console.log) {
            window.console.log(obj);
        }
    };

    //Get query string parameters
    function query(sParam) {

        if (!sParam)
            return null;

        var sPageURL = decodeURIComponent(window.location.search.substring(1)),
            sURLVariables = sPageURL.split('&'),
            sParameterName,
            i;

        for (i = 0; i < sURLVariables.length; i++) {
            sParameterName = sURLVariables[i].split('=');

            if (sParameterName[0] === sParam) {
                return sParameterName[1] === undefined ? true : sParameterName[1];
            }
        }
        return null;
    };

    function checkUrlParameters() {
        var s = ls.urlParameters;

        var address = query(s.address),
            latitude = query(s.latitude),
            longitude = query(s.longitude),
            latlong = query(s.latlong),
            search = query(s.search),
            page = query(s.page);

        //Split LatLong
        if (latlong && latlong.indexOf(',') != -1) {
            latitude = latlong.split(',')[0];
            longitude = latlong.split(',')[1];
        }

        //Apply Parameters
        if (search) {
            var escapedSearch = search.replace(/[']/gi, "\\'");
            if(ls.searchParams['q.parser'] == 'structured') {
                // check to see if the search term
                // is a phrase wrapped in '' or ""
                if( (search.indexOf('"') === 0 && search.lastIndexOf('"') === search.length -1) ) {
                    ls.searchParams.q = '(phrase \'' + escapedSearch +'\')';
                } else if (search.indexOf("'") === 0 && search.lastIndexOf("'") === search.length -1){

                    ls.searchParams.q = '(phrase ' + search.replace("'","\\'") + ')';
                } else {
                    ls.searchParams.q = '(or ';

                    ls.searchParams.q += '(term \'' + escapedSearch +'\')';
                    ls.searchParams.q += '(prefix \'' + escapedSearch +'\')';
                    // $(search.split(' ')).each(function(k,v){
                    //     ls.searchParams.q += '(term \''+v+'\')';
                    //     ls.searchParams.q += '(prefix \''+v+'\')';
                    // });
                    ls.searchParams.q += ')';
                }
            } else {
                ls.searchParams.q = '\'' + escapedSearch + '\'';
            }
        }
        if (page && ls.results.pager.updateHistory) {
            local.currentPage = Math.floor(parseFloat(page));
            if (ls.results.pager.loadMore) {
                ls.searchParams.start = 0;
                ls.searchParams.top = local.currentPage * ls.searchParams.size;
            } else {
                ls.searchParams.start = (local.currentPage - 1) * ls.searchParams.size;
            }
        }

        if (latitude && longitude) {
            ls.geoSearch.lat = latitude;
            ls.geoSearch.lng = longitude;
        }

        //Check is is necessary to resolve the address
        if (address && !latitude && !longitude && !latlong) {
            var r = resolveAddress(address);
            if (r) {
                latitude = r[0];
                longitude = r[1];
            }
        }

    }

    // update the current page query string for active facets
    function updateFacetHistory() {

        var facetParam, urlInit, urlNew, facetString, updatedHistoryUrl;
        urlInit = window.location.pathname + window.location.search;
        facetParam = ls.urlParameters.facets;
        // check to see if facets are already in the
        // query string, and if so, remove them
        if (urlInit.indexOf(facetParam) > -1) {
            urlNew = updateUrlParameter(urlInit, facetParam);
        } else {
            urlNew = urlInit;
        }
        // check to see if facets have been 
        // applied to the search options
        // and if so, add them to the query string
        if (ls.facetsSelected.length > 0) {

            // facetString = .toString();
            facetString = '';
            $.each(ls.facetsSelected, function (k, v) {
                if (k > 0) {
                    facetString += ';';
                }
                facetString += encodeURIComponent(v.toString());
            });
            updatedHistoryUrl = urlNew;
            updatedHistoryUrl += (urlNew.indexOf('?') > -1) ? '&' : '?';
            updatedHistoryUrl += facetParam + '=' + facetString;
        } else {
            updatedHistoryUrl = urlNew;
        }
        // push the new search query string to the browser history
        window.history.replaceState({ 'url': updatedHistoryUrl }, '', updatedHistoryUrl);
    }

    // update the current page query string for pagination
    function updatePageHistory() {

        var urlInit, urlNew, pageParam, pageVal, updatedHistoryUrl;
        urlInit = window.location.pathname + window.location.search;
        pageParam = ls.urlParameters.page;
        // check to see if facets are already in the
        // query string, and if so, remove them
        if (urlInit.indexOf(pageParam) > -1) {
            urlNew = updateUrlParameter(urlInit, pageParam);
        } else {
            urlNew = urlInit;
        }
        // check to see if facets have been 
        // applied to the search options
        // and if so, add them to the query string
        if (local.currentPage > 1) {
            // facetString = .toString();
            pageVal = local.currentPage.toString();

            updatedHistoryUrl = urlNew;
            updatedHistoryUrl += (urlNew.indexOf('?') > -1) ? '&' : '?';
            updatedHistoryUrl += pageParam + '=' + pageVal;
        } else {
            updatedHistoryUrl = urlNew;
        }
        // push the new search query string to the browser history
        window.history.replaceState({ 'url': updatedHistoryUrl }, 'page', updatedHistoryUrl);
    }

    //append or update query string parameters
    function updateUrlParameter(uri, key, value) {
        // remove the hash part before operating on the uri
        var i = uri.indexOf('#');
        var hash = i === -1 ? '' : uri.substr(i);
        uri = i === -1 ? uri : uri.substr(0, i);

        var re = new RegExp("([?&])" + key + "=.*?(&|$)", "i");
        var separator = uri.indexOf('?') !== -1 ? "&" : "?";

        if (!value) {
            // remove key-value pair if value is empty
            uri = uri.replace(new RegExp("([?&]?)" + key + "=[^&]*", "i"), '');
            if (uri.slice(-1) === '?') {
                uri = uri.slice(0, -1);
            }
            // replace first occurrence of & by ? if no ? is present
            if (uri.indexOf('?') === -1) {
                uri = uri.replace(/&/, '?')
            }
        } else if (uri.match(re)) {
            uri = uri.replace(re, '$1' + key + "=" + value + '$2');
        } else {
            uri = uri + separator + key + "=" + value;
        }
        return uri + hash;
    }


}(jQuery));

