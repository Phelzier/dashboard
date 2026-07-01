        // ── GLOBAL STATE ──
        var activeStatusFilter = 'ALL';
        var activeSelectedHasAssets = [];
        var activeSelectedMissingAssets = [];
        var shelfModeActive = true;
        var selectionModeActive = false;
        var selectedTrackIds = [];
        var activeSortKey = 'none';
        var activeSortDir = 'desc'; // 'asc' or 'desc'
        var BATCH_EMAIL_BODY_CHAR_LIMIT = 1800;
        var currentUploadModalTrackId = null;
        var currentLyricsTrackContext = null;
        var KEY_NAMES = ['C','C♯/D♭','D','D♯/E♭','E','F','F♯/G♭','G','G♯/A♭','A','A♯/B♭','B'];

        // ── DATA MODEL ──
        var MLP = { tracks: [], artists: [], profiles: [], companies: [], summary: {}, usdToGbpRate: 1, generated: '', version: '' };
        var _trackMap = {};

        (function loadData() {
            fetch('./data.json?v=' + Date.now())
                .then(function(r) { return r.json(); })
                .then(function(data) {
                    MLP = data;
                    MLP.tracks.forEach(function(t) { _trackMap[t.id] = t; });
                    if (data.usdToGbpRate) window.USD_TO_GBP = data.usdToGbpRate;
                    populateFilterDropdowns();
                    renderArtistPanel();
                    renderSummaryCards();
                    evaluateControlMatrix();
                })
                .catch(function(err) {
                    document.getElementById('cardsContainer').innerHTML = '<div style="padding:20px;color:#e53e3e;">Failed to load dashboard data. Please refresh. (' + err + ')</div>';
                });
        })();

        function populateFilterDropdowns() {
            var ps = document.getElementById('profileSelect');
            while (ps.options.length > 2) ps.remove(2);
            (MLP.profiles || []).forEach(function(p) { var o = document.createElement('option'); o.value = p; o.text = p; ps.appendChild(o); });
            var ss = document.getElementById('sortBySelect');
            while (ss.options.length > 2) ss.remove(2);
            var nameOpt = document.createElement('option'); nameOpt.value = 'name'; nameOpt.text = 'Sort: Name'; ss.appendChild(nameOpt);
            var rdOpt = document.createElement('option'); rdOpt.value = 'release-date'; rdOpt.text = 'Sort: Release Date'; ss.appendChild(rdOpt);
            var cOpt = document.createElement('option'); cOpt.value = 'confidence'; cOpt.text = 'Sort: Confidence'; ss.appendChild(cOpt);
            (MLP.companies || []).forEach(function(c) { var k = c.replace(/[^a-zA-Z0-9]/g,'').toLowerCase(); var o = document.createElement('option'); o.value = 'earnings-' + k; o.text = 'Sort: ' + c; ss.appendChild(o); });
        }

        function renderSummaryCards() {
            var s = MLP.summary || {};
            var el = function(id, val) { var e = document.getElementById(id); if (e) { var n = e.querySelector('.summary-num'); if (n) n.textContent = val; } };
            el('btn-all', s.total || 0); el('btn-ready', s.ready || 0); el('btn-missing', s.missing || 0); el('btn-errors', s.errors || 0);
        }

        function renderArtistPanel() {
            var container = document.getElementById('panel-artist');
            if (!container || !MLP.artists) return;
            var grid = container.querySelector('.artist-grid');
            if (!grid) { grid = document.createElement('div'); grid.className = 'artist-grid'; container.appendChild(grid); }
            grid.innerHTML = '';
            MLP.artists.forEach(function(artist) {
                var imgHtml = artist.heroImg ? '<img class="artist-card-hero" src="' + escHtml(artist.heroImg) + '" alt="' + escHtml(artist.name) + '">' : '<div class="artist-card-hero" style="display:flex;align-items:center;justify-content:center;font-size:4rem;background:#e2e8f0;">\uD83C\uDFA4</div>';
                var albumsHtml = (artist.albums || []).map(function(alb) {
                    var src = alb.img64 || alb.img300 || '';
                    var artHtml = src ? '<img class="artist-album-chip-art" src="' + escHtml(src) + '" alt="">' : '<div class="artist-album-chip-art" style="background:#e2e8f0;">\uD83D\uDCBF</div>';
                    var yr = (alb.releaseDate || '').match(/^(\d{4})/);
                    return '<div class="artist-album-chip" data-album="' + escHtml(alb.name) + '">' + artHtml + '<span class="artist-album-chip-name">' + escHtml(alb.name) + '</span><span class="artist-album-chip-count">' + (yr ? yr[1] : '') + '</span></div>';
                }).join('');
                var card = document.createElement('div');
                card.className = 'artist-card'; card.setAttribute('data-artist', artist.name);
                card.innerHTML = imgHtml + '<div class="artist-card-body"><div class="artist-card-name">' + escHtml(artist.name) + '</div><div class="artist-card-meta">' + artist.trackCount + ' track(s)</div><div class="section-header">Albums &amp; Singles</div><div class="artist-album-list">' + albumsHtml + '</div></div>';
                card.querySelectorAll('.artist-album-chip').forEach(function(chip) { chip.onclick = function() { showPanel('album', { albumName: chip.getAttribute('data-album') }); }; });
                grid.appendChild(card);
            });
        }

        function buildCardHtml(t) {
            var spc = (t.status || '').toLowerCase().replace(/ /g, '-');
            var stepHtml = '';
            for (var si = 0; si < 5; si++) { var cls = si < t.lifecycleStage ? 'stage-complete' : (si === t.lifecycleStage ? 'stage-current' : 'stage-pending'); stepHtml += '<span class="stage-segment ' + cls + '"></span>'; }
            var AF = ['Canvas','Clip','Cover','Lyrics','Reel','mp3','wav','URL','AlbumReel','Stems','DAW','Mastered'];
            var UM = { Canvas:{accept:'video/mp4',ext:'mp4'}, Clip:{accept:'audio/mpeg,.mp3',ext:'mp3'}, Cover:{accept:'image/png,image/jpeg',ext:'png'}, Lyrics:{accept:'.txt,text/plain',ext:'txt'}, Reel:{accept:'video/mp4',ext:'mp4'}, AlbumReel:{accept:'video/mp4',ext:'mp4'} };
            var DL = { Canvas:'Cv', Clip:'Cl', Cover:'Co', Lyrics:'Ly', Reel:'Re', mp3:'M3', wav:'Wv', URL:'Ur', AlbumReel:'AR', Stems:'St', DAW:'DW', Mastered:'Ms' };
            var ex = (t.existing || '').split(',').filter(Boolean);
            var mr = '', gr = '<div class="graphic-matrix-row">';
            AF.forEach(function(f) {
                var has = ex.indexOf(f.toLowerCase()) >= 0;
                var dl = DL[f] || f.slice(0,2);
                var gh = t.githubAssets && t.githubAssets[f] ? ' <a href="' + escHtml(t.githubAssets[f]) + '" target="_blank" class="link-icon">GH &#x1F517;</a>' : '';
                var nl = t.nasUrl ? ' <a href="' + escHtml(t.nasUrl) + '" target="_blank" class="link-icon">NAS &#x1F517;</a>' : '';
                var bh, dh;
                if (has) {
                    bh = '<div class="meta-value-row"><span class="badge yes">YES</span><span class="link-icon-group">' + nl + gh + '</span></div>';
                    dh = '<span class="graphic-dot dot-yes" title="' + f + ': Yes">' + dl + '</span>';
                } else {
                    var um = UM[f];
                    if (um) {
                        var oa = 'openUploadRowAction(' + JSON.stringify(t.id) + ',' + JSON.stringify(t.title) + ',' + JSON.stringify(f) + ',' + JSON.stringify(um.accept) + ',' + JSON.stringify(um.ext) + ')';
                        bh = '<span class="badge no uploadable" onclick="' + oa + '" title="Tap to upload">No &#x1F4E4;</span>';
                        dh = '<span class="graphic-dot dot-no uploadable" onclick="' + oa + '" title="' + f + ': Missing">' + dl + '</span>';
                    } else { bh = '<span class="badge no">No</span>'; dh = '<span class="graphic-dot dot-no" title="' + f + ': Missing">' + dl + '</span>'; }
                }
                mr += '<div class="meta-row"><span class="label">' + f + ':</span>' + bh + '</div>';
                gr += dh;
            });
            gr += '<button class="graphic-dot upload-trigger-dot" onclick="toggleUploadPicker(' + JSON.stringify(t.id) + ')" title="Upload">&#x1F4E4;</button></div>';
            var sbh;
            if (t.spotifyConfirmed && t.spotifyUrl) {
                var tip = 'Album: ' + (t.spotifyAlbum||'') + ' | Released: ' + (t.spotifyReleaseDate||'') + ' | Artist: ' + (t.spotifyArtist||'');
                sbh = '<a href="' + escHtml(t.spotifyUrl) + '" target="_blank" class="badge yes-link" title="' + escHtml(tip) + '">Live on Spotify &#x2713;</a>';
                if (t.spotifyTitleMatchesDk === false && t.spotifyTrackName) sbh += ' <span class="badge neutral">&#x26A0; Title differs</span>';
            } else if (t.isrc && t.isrc !== 'N/A') { sbh = '<span class="badge neutral">Not found on Spotify yet</span>'; }
            else { sbh = '<span class="badge neutral">No ISRC</span>'; }
            var gbp = window.USD_TO_GBP || MLP.usdToGbpRate || 1;
            var ebd = t.earningsByCompany ? Object.keys(t.earningsByCompany).sort().map(function(k){ return k + ': &#xA3;' + ((t.earningsByCompany[k]||0)*gbp).toFixed(2); }).join(' | ') : '';
            var ebh = '<span class="badge yes-link" title="' + escHtml(ebd || 'No earnings recorded yet') + '">&#xA3;' + ((t.earningsTotal||0)*gbp).toFixed(2) + '</span>';
            var rvh = (t.earningsByCompany && Object.keys(t.earningsByCompany).length) ? Object.keys(t.earningsByCompany).sort().map(function(k){ return '<span class="badge yes">'+escHtml(k)+'</span>'; }).join(' ') : '<span class="badge neutral">No revenue streams yet</span>';
            var ffh = (t.platforms && Object.keys(t.platforms).length) ? Object.keys(t.platforms).sort().map(function(k){ return '<a href="'+escHtml(String(t.platforms[k]))+'" target="_blank" class="badge yes-link">'+escHtml(k)+'</a>'; }).join(' ') : '<span class="badge neutral">No smart link platforms found</span>';
            var vtt = t.verificationCount > 0 ? ('Verified '+t.verificationCount+' time'+(t.verificationCount!==1?'s':'')+' - last: '+escHtml(t.lastVerified||'')+'. Tap to verify again.') : 'Not yet verified';
            var vcb = t.verificationCount > 0 ? '<span style="font-size:0.65rem;font-weight:800;vertical-align:super;">'+t.verificationCount+'</span>' : '';
            var pp = (t.pubData && t.pubData.platform) ? t.pubData.platform : '';
            var pd = (t.pubData && t.pubData.date) ? t.pubData.date : '';
            var pl = (t.pubData && t.pubData.link) ? t.pubData.link : '';
            var pbh = t.published ? '<span class="badge yes" title="'+escHtml(pp)+' | '+escHtml(pd)+'">Published &#x2713;</span>' : '<span class="badge neutral">Not published</span>';
            var vbh = t.verificationCount > 0 ? '<span class="badge yes" title="Last: '+escHtml(t.lastVerified||'')+'">Verified x'+t.verificationCount+'</span>' : '<span class="badge neutral">Not verified</span>';
            var elh = (t.errors === 'Yes' || t.errorText) ? '<div class="error-log-box" id="logbox-'+t.id+'"><strong>Active Error Log Context:</strong><br>'+escHtml(t.errorText||'')+'</div>' : '<div class="error-log-box" id="logbox-'+t.id+'" style="display:none;"></div>';
            var alh = (t.isAlbum && t.albumGroup && t.albumGroup !== 'N/A') ? '<a href="#" class="album-link" data-album="'+escHtml(t.albumGroup)+'">'+escHtml(t.albumGroup)+'</a>' : '<span>'+escHtml(t.albumGroup||'N/A')+'</span>';
            var slh = t.spotifySingleName ? (t.spotifySingleUrl ? '<a href="'+escHtml(t.spotifySingleUrl)+'" target="_blank" class="badge yes-link">'+escHtml(t.spotifySingleName)+'</a>' : '<span class="badge yes">'+escHtml(t.spotifySingleName)+'</span>') : '';
            var singleRowHtml = t.spotifyIsSingle ? '<div class="meta-row"><span class="label">Single:</span>'+slh+'</div>' : '';
            var ih = (t.isrc && t.isrc !== 'N/A') ? '<span class="badge yes">'+escHtml(t.isrc)+'</span>' : '<span class="badge neutral">N/A</span>';
            var ea = t.earningsByCompany ? Object.keys(t.earningsByCompany).map(function(k){ return ' data-earnings-'+k.replace(/[^a-zA-Z0-9]/g,'').toLowerCase()+'="'+(t.earningsByCompany[k]||0)+'"'; }).join('') : '';
            var h = '<div class="card" id="'+t.id+'" data-title="'+escHtml(t.title)+'" data-status="'+escHtml(t.status)+'" data-errors="'+escHtml(t.errors)+'" data-missing="'+escHtml(t.missing)+'" data-existing="'+escHtml(t.existing)+'" data-profile="'+escHtml(t.profile||'')+'" data-is-album="'+(t.isAlbum?'TRUE':'FALSE')+'" data-is-single="'+(t.spotifyIsSingle?'TRUE':'FALSE')+'" data-single-name="'+escHtml(t.spotifySingleName||'')+'" data-album-group="'+escHtml(t.albumGroup||'')+'" data-explicit="'+(t.explicit?'TRUE':'FALSE')+'" data-published="'+(t.published?'TRUE':'FALSE')+'" data-earnings-total="'+(t.earningsTotal||0)+'" data-isrc="'+escHtml(t.isrc||'')+'" data-spotify-artist="'+escHtml(t.spotifyArtist||'')+'" data-spotify-url="'+escHtml(t.spotifyUrl||'')+'" data-spotify-uri="'+escHtml(t.spotifyUri||'')+'" data-artist-filter="'+escHtml(t.spotifyArtist||'')+'" data-release-date="'+escHtml(t.spotifyReleaseDate||'')+'"'+ea+'>';
            h += '<div class="card-select-wrapper"><input type="checkbox" class="card-select-checkbox" id="select-'+t.id+'" data-song-name="'+escHtml(t.title)+'" onchange="onCardSelectionChanged(\''+t.id+'\')" /></div>';
            h += '<div class="card-main-content"><img class="thumb-img" src="'+escHtml(t.thumbUrl||'data:image/png;base64,')+'" alt="Cover" /><div class="card-details"><div class="card-details-top-row"><h3>'+escHtml(t.title)+' <span class="status-pill '+spc+'">'+escHtml(t.status)+'</span></h3><div class="card-actions-wrapper"><button class="detail-btn" onclick="showPanel(\'detail\',{cardId:\''+t.id+'\'})">Detail</button><span id=\"conf-badge-'+t.id+'\" style=\"display:none;font-size:0.7rem;color:#1DB954;font-weight:700;margin-left:4px;\"></span>'+(t.spotifyUri&&_spotifyAccessToken?'<button class="action-icon-btn" onclick="playerPlayUriInContext(\''+t.spotifyUri+'\')" title="Play in order">&#x25B6;</button>':'')+'<button class="action-icon-btn" onclick="dispatchVerificationMarkViaEmail(\''+t.id+'\','+JSON.stringify(t.title)+')" title="'+escHtml(vtt)+'">&#x1F44D;'+vcb+'</button><button class="action-icon-btn" onclick="toggleUploadPicker(\''+t.id+'\')" title="Upload a missing item">&#x1F4E4;</button><button class="action-icon-btn" onclick="togglePublicationForm(\''+t.id+'\')" title="Update publication">&#x1F310;</button><button class="action-icon-btn" onclick="toggleErrorSubmissionForm(\''+t.id+'\')">&#x26A0;&#xFE0F;</button><button class="action-icon-btn" onclick="openTrackDetailPopup(\\\''+t.id+'\\\')" title="More detail">&#x1F50D;</button><a href="'+escHtml(t.nasUrl||'')+'" class="action-icon-btn" target="_blank">&#x1F4C1;</a></div></div><div class="lifecycle-stepper" title="Stem Creation -> DAW Creation -> Asset Gathering -> Ready -> Released">'+stepHtml+'</div><div class="meta-grid"><div class="meta-row"><span class="label">Album:</span>'+alh+'</div>'+singleRowHtml+'<div class="meta-row"><span class="label">Profile:</span><span>'+escHtml(t.profile||'N/A')+'</span></div><div class="meta-row"><span class="label">ISRC:</span>'+ih+'</div>'+mr+elh+'<div class="meta-row"><span class="label">Published:</span>'+pbh+'</div><div class="meta-row"><span class="label">Verified:</span>'+vbh+'</div><div class="meta-row"><span class="label">Spotify:</span>'+sbh+'</div><div class="meta-row"><span class="label">Revenue Stream:</span>'+rvh+'</div><div class="meta-row"><span class="label">Earnings:</span>'+ebh+'</div><div class="meta-row"><span class="label">Platforms:</span>'+ffh+'<div class="meta-row"><span class="label">Confidence:</span><span style="font-size:0.85rem;color:#1DB954;font-weight:600;">'+(_confidenceScores[t.id]?'\uD83D\uDC4D '+_confidenceScores[t.id]+' thumbs up':'Not yet rated')+'</span></div></div>'+gr+'</div></div>';
            h += '<div class="error-subform-panel" id="subform-'+t.id+'"><div class="subform-grid"><div class="subform-row"><label>Time:</label><input type="text" id="input-stamp-'+t.id+'" class="subform-input" placeholder="1:24 (MM:SS)" /></div><div class="subform-row"><label>Issue:</label><input type="text" id="input-issue-'+t.id+'" class="subform-input" /></div><div class="subform-row"><label>Fix:</label><input type="text" id="input-fix-'+t.id+'" class="subform-input" /></div><div class="subform-actions"><button class="subform-btn btn-add" onclick="stageLocalErrorEntry(\''+t.id+'\','+JSON.stringify(t.title)+')">Stage Note</button><button class="subform-btn btn-email" onclick="dispatchStagedErrorsViaGitHub(\''+t.id+'\','+JSON.stringify(t.title)+')">Send Report</button></div><div class="staged-errors-ledger" id="ledger-'+t.id+'"></div></div></div>';
            h += '<div class="publication-subform-panel" id="pubform-'+t.id+'"><div class="subform-grid"><div class="subform-row"><label>Platform:</label><input type="text" id="pub-platform-'+t.id+'" class="subform-input" placeholder="Spotify, YouTube, etc." value="'+escHtml(pp)+'" /></div><div class="subform-row"><label>Date:</label><input type="text" id="pub-date-'+t.id+'" class="subform-input" placeholder="YYYY-MM-DD" value="'+escHtml(pd)+'" /></div><div class="subform-row"><label>Link:</label><input type="text" id="pub-link-'+t.id+'" class="subform-input" placeholder="https://..." value="'+escHtml(pl)+'" /></div><div class="subform-actions"><button class="subform-btn btn-email" onclick="dispatchPublicationUpdateViaEmail(\''+t.id+'\','+JSON.stringify(t.title)+')">Send Update</button></div></div></div></div>';
            return h;
        }


        // ── PANEL NAVIGATION ──
        // panelHistory tracks context so the browser back button works
        var currentPanel = 'artist';
        var panelHistory = [];

        function showPanel(name, ctx) {
            // Push current state before switching
            if (name !== currentPanel) {
                history.pushState({ panel: name, ctx: ctx || null }, '', '#' + name);
            }
            _activatePanel(name, ctx);
        }

        function _activatePanel(name, ctx) {
            document.querySelectorAll('.panel').forEach(function(p) { p.classList.remove('active'); });
            document.querySelectorAll('.nav-tab').forEach(function(t) { t.classList.remove('active'); });
            var el = document.getElementById('panel-' + name);
            if (el) el.classList.add('active');
            var tab = document.getElementById('tab-' + name);
            if (tab) tab.classList.add('active');
            currentPanel = name;
            try {
                if (name === 'album' && ctx && ctx.albumName) renderAlbumPanel(ctx);
                else if (name === 'album') renderAlbumGrid();
                else if (name === 'detail' && ctx) renderDetailPanel(ctx);
                else if (name === 'songs') evaluateControlMatrix();
                else if (name === 'spotify') loadSpotifyPanel();
                else if (name === 'admin') { refreshDiagnostics(); }
            } catch(e) {
                console.error('Panel render error (' + name + '):', e);
            }
            window.scrollTo(0, 0);
        }

        // Browser back button support
        window.addEventListener('popstate', function(e) {
            var state = e.state;
            if (state && state.panel) {
                _activatePanel(state.panel, state.ctx);
            } else {
                _activatePanel('artist', null);
            }
        });

        // ── ARTIST PANEL ──
        function renderArtistPanel() {
            // Artists rendered server-side; wire chip and card clicks here
            document.querySelectorAll('.artist-album-chip[data-album]').forEach(function(chip) {
                chip.onclick = function(e) {
                    e.stopPropagation();
                    showPanel('album', { albumName: chip.getAttribute('data-album') });
                };
            });
            document.querySelectorAll('.artist-card[data-artist]').forEach(function(card) {
                card.onclick = function(e) {
                    if (e.target.closest('.artist-album-chip')) return;
                    // Filter songs panel by exact artist attribute, not text search
                    var artistName = card.getAttribute('data-artist');
                    document.getElementById('searchInput').value = '';
                    activeArtistFilter = artistName;
                    showPanel('songs');
                };
            });
            // ── Artist analytics summary (Point 8) ──
            var convRate = (MLP && MLP.usdToGbpRate) || (1 / 1.3418);
            document.querySelectorAll('.artist-card[data-artist]').forEach(function(card) {
                var artistName = (card.getAttribute('data-artist') || '').toLowerCase();
                var totalEarnings = 0, compMap = {}, totalStreams = 0;
                if (MLP && Array.isArray(MLP.tracks)) {
                    MLP.tracks.forEach(function(t) {
                        if ((t.spotifyArtist || '').toLowerCase() !== artistName) return;
                        totalEarnings += (t.earningsTotal || 0);
                        if (t.earningsByCompany) {
                            Object.keys(t.earningsByCompany).forEach(function(k) {
                                compMap[k] = (compMap[k] || 0) + t.earningsByCompany[k];
                            });
                        }
                    });
                }
                var gbpStr = (totalEarnings * convRate).toFixed(2);
                var breakdown = Object.keys(compMap).map(function(k) {
                    return k + ': £' + (compMap[k] * convRate).toFixed(2);
                }).join(' | ') || 'No distribution data.';
                var existing = card.querySelector('.artist-analytics-summary');
                if (existing) existing.remove();
                var body = card.querySelector('.artist-card-body');
                if (!body) return;
                var summary = document.createElement('div');
                summary.className = 'artist-analytics-summary';
                summary.style.cssText = 'background:var(--bg-card);border:1px solid var(--border);border-radius:6px;padding:10px;margin-bottom:10px;font-size:0.8rem;';
                summary.innerHTML = '<div><strong>Catalog Yield:</strong> £' + gbpStr + '</div>' +
                    '<div style="font-size:0.72rem;color:var(--text-muted);">' + breakdown + '</div>';
                body.insertAdjacentElement('afterbegin', summary);
            });
        }

        // ── ALBUM GRID (all albums — shown when Albums tab clicked with no context) ──
        var _albumGridCache = null;
        function renderAlbumGrid() {
            var panel = document.getElementById('panel-album');
            var bc = panel.querySelector('.breadcrumb');
            if (bc) bc.innerHTML = '<a href="#" onclick="showPanel(\'artist\');return false;">Artists</a><span class="breadcrumb-sep">›</span><span>Albums</span>';

            if (_albumGridCache) {
                var container = panel.querySelector('#album-hero-container');
                if (container) { container.innerHTML = _albumGridCache; _wireAlbumGridClicks(); return; }
            }

            // Collect unique albums from card data
            var cards = document.querySelectorAll('.card[data-album-group]');
            var seen = {}, albums = [];
            cards.forEach(function(c) {
                var name = c.getAttribute('data-album-group') || '';
                if (!name || name === 'N/A' || seen[name.toLowerCase()]) return;
                seen[name.toLowerCase()] = true;
                albums.push({
                    name:    name,
                    art:     c.getAttribute('data-album-art') || '',
                    type:    c.getAttribute('data-album-type') || '',
                    release: c.getAttribute('data-release-date') || '',
                    count:   0
                });
            });
            // Count tracks per album
            cards.forEach(function(c) {
                var n = (c.getAttribute('data-album-group') || '').toLowerCase();
                var found = albums.filter(function(a) { return a.name.toLowerCase() === n; })[0];
                if (found) found.count++;
            });
            // Sort by release date desc
            albums.sort(function(a, b) { return b.release.localeCompare(a.release); });

            var html = '<div class="album-grid">';
            albums.forEach(function(alb) {
                var artHtml = alb.art
                    ? '<img class="album-list-art" src="' + escHtml(alb.art) + '" alt="">'
                    : '<div class="album-list-art" style="display:flex;align-items:center;justify-content:center;font-size:2.5rem;background:#e2e8f0;">💿</div>';
                var year = alb.release ? alb.release.slice(0, 4) : '';
                html += '<div class="album-list-card" data-album-name="' + escHtml(alb.name) + '">' +
                    artHtml +
                    '<div class="album-list-body">' +
                    '<div class="album-list-title">' + escHtml(alb.name) + '</div>' +
                    '<div class="album-list-meta">' + escHtml(alb.type || 'Release') + (year ? ' · ' + year : '') + ' · ' + alb.count + ' tracks</div>' +
                    '</div></div>';
            });
            html += '</div>';

            _albumGridCache = html;
            var container = panel.querySelector('#album-hero-container');
            if (container) { container.innerHTML = html; _wireAlbumGridClicks(); }
        }

        function _wireAlbumGridClicks() {
            document.querySelectorAll('.album-list-card[data-album-name]').forEach(function(card) {
                card.onclick = function() { showPanel('album', { albumName: card.getAttribute('data-album-name') }); };
            });
        }

        // ── ALBUM DETAIL (single album) ──
        function renderAlbumPanel(ctx) {
            var albumName = ctx.albumName || '';
            var panel = document.getElementById('panel-album');

            var bc = panel.querySelector('.breadcrumb');
            if (bc) bc.innerHTML =
                '<a href="#" onclick="showPanel(\'artist\');return false;">Artists</a>' +
                '<span class="breadcrumb-sep">›</span>' +
                '<a href="#" onclick="showPanel(\'album\');return false;">Albums</a>' +
                '<span class="breadcrumb-sep">›</span>' +
                '<span>' + escHtml(albumName) + '</span>';

            var cards = document.querySelectorAll('.card[data-album-group]');
            var albumCards = [];
            cards.forEach(function(c) {
                if ((c.getAttribute('data-album-group') || '').toLowerCase() === albumName.toLowerCase()) albumCards.push(c);
            });

            var heroArt = '', heroArtist = '', heroType = '', heroRelease = '', heroSpotifyUrl = '', heroGenres = '', heroUPC = '';
            if (albumCards.length > 0) {
                var fc = albumCards[0];
                heroArt        = fc.getAttribute('data-album-art') || '';
                heroArtist     = fc.getAttribute('data-spotify-artist') || '';
                heroType       = fc.getAttribute('data-album-type') || '';
                heroRelease    = fc.getAttribute('data-release-date') || '';
                heroSpotifyUrl = fc.getAttribute('data-album-spotify-url') || '';
                heroGenres     = fc.getAttribute('data-album-genres') || '';
                heroUPC        = fc.getAttribute('data-album-upc') || '';
            }

            var artHtml = heroArt
                ? '<img class="album-hero-art" src="' + escHtml(heroArt) + '" alt="Album art">'
                : '<div class="album-hero-art" style="display:flex;align-items:center;justify-content:center;font-size:2rem;">💿</div>';
            var artistLink   = heroArtist ? '<a href="#" onclick="showPanel(\'artist\');return false;">' + escHtml(heroArtist) + '</a>' : '';
            var spotifyChip  = heroSpotifyUrl ? '<a href="' + escHtml(heroSpotifyUrl) + '" target="_blank" class="album-stat-chip green">Open on Spotify ↗</a>' : '';
            var genreChip    = heroGenres ? '<span class="album-stat-chip">' + escHtml(heroGenres) + '</span>' : '';
            var upcChip      = heroUPC ? '<span class="album-stat-chip">UPC: ' + escHtml(heroUPC) + '</span>' : '';

            var heroHtml = '<div class="album-hero">' +
                '<div class="album-hero-top">' + artHtml +
                '<div class="album-hero-info">' +
                (heroType ? '<div class="album-hero-type">' + escHtml(heroType) + '</div>' : '') +
                '<div class="album-hero-title">' + escHtml(albumName) + '</div>' +
                '<div class="album-hero-artist">' + artistLink + '</div>' +
                '<div class="album-hero-meta">' +
                (heroRelease ? '<span class="album-stat-chip">' + escHtml(heroRelease) + '</span>' : '') +
                '<span class="album-stat-chip">' + albumCards.length + ' tracks</span>' +
                genreChip + upcChip + spotifyChip +
                '</div></div></div><div class="album-tracklist">';

            albumCards.sort(function(a, b) {
                return (parseInt(a.getAttribute('data-track-num')) || 999) - (parseInt(b.getAttribute('data-track-num')) || 999);
            });

            albumCards.forEach(function(c, idx) {
                var tName   = c.getAttribute('data-title') || '';
                var status  = (c.getAttribute('data-status') || '').toLowerCase();
                var dur     = c.getAttribute('data-duration') || '';
                var domId   = c.id;
                var pillCls = status === 'ready' ? 'ready' : status.replace(/ /g, '-');
                heroHtml += '<div class="album-track-row" onclick="showPanel(\'detail\',{cardId:\'' + domId + '\'})">' +
                    '<span class="album-track-num">' + (idx + 1) + '</span>' +
                    '<span class="album-track-name">' + escHtml(tName) + '</span>' +
                    '<span class="album-track-status"><span class="status-pill ' + pillCls + '">' + escHtml(status) + '</span></span>' +
                    '<span class="album-track-dur">' + escHtml(dur) + '</span>' +
                    '</div>';
            });

            heroHtml += '</div></div>';
            var container = panel.querySelector('#album-hero-container');
            if (container) {
                container.innerHTML = heroHtml;
                // ── Analytics banner (Point 7) ──
                var aggEarnings = 0, compMap = {}, completedCount = 0;
                albumCards.forEach(function(c) {
                    var t = _trackMap[c.id];
                    if (!t) return;
                    aggEarnings += (t.earningsTotal || 0);
                    if (t.earningsByCompany) {
                        Object.keys(t.earningsByCompany).forEach(function(k) {
                            compMap[k] = (compMap[k] || 0) + t.earningsByCompany[k];
                        });
                    }
                    if (t.status && (t.status.toLowerCase() === 'ready' || t.status.toLowerCase() === 'released')) completedCount++;
                });
                var convRate = (MLP && MLP.usdToGbpRate) || (1 / 1.3418);
                var gbpStr = (aggEarnings * convRate).toFixed(2);
                var completeness = albumCards.length > 0 ? Math.round((completedCount / albumCards.length) * 100) : 0;
                var compBreakdown = Object.keys(compMap).map(function(k) {
                    return k + ': £' + (compMap[k] * convRate).toFixed(2);
                }).join(' | ') || 'No distribution data.';
                var banner = '<div class="album-analytics-banner" style="background:var(--bg-card);border:1px solid var(--border);padding:12px;border-radius:8px;margin-bottom:14px;font-size:0.85rem;">' +
                    '<strong>Album Yield:</strong> <span style="color:#1DB954;font-weight:700;">£' + gbpStr + '</span>' +
                    '<div style="color:var(--text-muted);font-size:0.75rem;margin-top:4px;">' + compBreakdown + '</div>' +
                    '<hr style="border:none;border-top:1px solid var(--border);margin:8px 0;">' +
                    '<div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;">' +
                    '<span><strong>UPC:</strong> ' + escHtml(heroUPC || 'N/A') + '</span>' +
                    '<span><strong>Completeness:</strong> ' + completeness + '%</span>' +
                    '</div></div>';
                var existing = container.querySelector('.album-analytics-banner');
                if (existing) existing.remove();
                container.insertAdjacentHTML('afterbegin', banner);
            }
        }

        // ── DETAIL PANEL ──
        function renderDetailPanel(ctx) {
            var cardId = ctx.cardId;
            var card = document.getElementById(cardId);
            var panel = document.getElementById('panel-detail');
            var container = panel.querySelector('#detail-content');

            if (!card) {
                if (container) container.innerHTML = '<div class="detail-section" style="color:var(--danger);">Track not found in current view.</div>';
                return;
            }

            try {
                var title    = card.getAttribute('data-title') || '';
                var albumName = card.getAttribute('data-album-group') || 'N/A';
                var artist   = card.getAttribute('data-spotify-artist') || '';
                var artSrc   = card.getAttribute('data-album-art') || '';
                var spotUrl  = card.getAttribute('data-spotify-url') || '';
                var isrc     = card.getAttribute('data-isrc') || '';
                var dur      = card.getAttribute('data-duration') || '';
                var pop      = parseInt(card.getAttribute('data-popularity')) || 0;
                var explicit = card.getAttribute('data-explicit') === 'TRUE';
                var status   = card.getAttribute('data-status') || '';
                var earnings = card.getAttribute('data-earnings-total') || '0';
                var nasUrl   = card.getAttribute('data-nas-url') || '#';

                // Audio features
                var tempo    = parseFloat(card.getAttribute('data-tempo')) || 0;
                var key      = parseInt(card.getAttribute('data-key'));
                var mode     = parseInt(card.getAttribute('data-mode'));
                var timeSig  = parseInt(card.getAttribute('data-timesig')) || 4;
                var energy   = parseFloat(card.getAttribute('data-energy')) || 0;
                var dance    = parseFloat(card.getAttribute('data-danceability')) || 0;
                var valence  = parseFloat(card.getAttribute('data-valence')) || 0;
                var acoustic = parseFloat(card.getAttribute('data-acousticness')) || 0;
                var instru   = parseFloat(card.getAttribute('data-instrumentalness')) || 0;
                var speech   = parseFloat(card.getAttribute('data-speechiness')) || 0;
                var live     = parseFloat(card.getAttribute('data-liveness')) || 0;
                var loudness = parseFloat(card.getAttribute('data-loudness')) || 0;

                // Popularity history
                var popHistory = [];
                try { popHistory = JSON.parse(card.getAttribute('data-pop-history') || '[]'); } catch(e) {}

                // FeatureFM
                var ffmLinks = [];
                try { ffmLinks = JSON.parse(card.getAttribute('data-ffm') || '[]'); } catch(e) {}

                var keyName  = (key >= 0 && key < 12) ? KEY_NAMES[key] : '—';
                var modeName = mode === 1 ? 'Major' : mode === 0 ? 'Minor' : '—';

                // Assets
                var existing = (card.getAttribute('data-existing') || '').split(',').filter(Boolean);
                var missing  = (card.getAttribute('data-missing') || '').split(',').filter(Boolean);
                var allAssets = ['cover','clip','canvas','reel','mp3','wav','lyrics','url','stems','daw','mastered','albumreel'];
                var assetDots = allAssets.map(function(a) {
                    var has = existing.indexOf(a) > -1;
                    var mis = missing.indexOf(a) > -1;
                    var cls = has ? 'dot-yes' : (mis ? 'dot-no' : 'dot-na');
                    return '<span class="graphic-dot ' + cls + '" title="' + a + '">' + assetEmoji(a) + '</span>';
                }).join('');

                var errorFormatIssues = [];
                try { errorFormatIssues = JSON.parse(card.getAttribute('data-error-format-issues') || '[]'); } catch(e) {}

                var artHtml = artSrc
                    ? '<img class="detail-hero-art" src="' + escHtml(artSrc) + '" alt="art">'
                    : '<div class="detail-hero-art" style="display:flex;align-items:center;justify-content:center;font-size:2rem;">🎵</div>';

                var albumLink = albumName !== 'N/A'
                    ? '<a href="#" onclick="showPanel(\'album\',{albumName:\'' + escJs(albumName) + '\'});return false;">' + escHtml(albumName) + '</a>'
                    : 'Single';
                var artistLink = artist
                    ? '<a href="#" onclick="showPanel(\'artist\');return false;">' + escHtml(artist) + '</a>'
                    : '';
                var spotifyLink = spotUrl ? ' · <a href="' + escHtml(spotUrl) + '" target="_blank">Spotify ↗</a>' : '';

                // Error subform cloned from hidden card DOM (so submission functions still work with the
                // original card's input IDs) - captured here so it can be inserted right after the hero,
                // just below the status/duration/ISRC chip row.
                var subform = document.getElementById('subform-' + cardId);
                var errorSubformHtml = subform ? subform.outerHTML.replace('id="subform-', 'id="detail-subform-').replace(/style="display:none"/g, '') : '';

                var html = '<div class="detail-hero">' +
                    '<div class="detail-hero-top">' + artHtml +
                    '<div class="detail-hero-info">' +
                    '<div class="detail-hero-title">' + escHtml(title) + (explicit ? ' <span class="badge flagged">E</span>' : '') + '</div>' +
                    '<div class="detail-hero-sub">' + artistLink + (albumName !== 'N/A' ? ' · ' + albumLink : '') + spotifyLink + '</div>' +
                    '<div class="detail-chip-row">' +
                    '<span class="status-pill ' + status.toLowerCase().replace(/ /g,'-') + '">' + escHtml(status) + '</span>' +
                    (dur ? '<span class="album-stat-chip">' + escHtml(dur) + '</span>' : '') +
                    (isrc ? '<span class="album-stat-chip">' + escHtml(isrc) + '</span>' : '') +
                    '</div></div></div></div>' + errorSubformHtml;

                // Popularity + sparkline
                if (pop > 0 || popHistory.length > 1) {
                    html += '<div class="detail-section"><div class="detail-section-title">Spotify Popularity</div>';
                    if (pop > 0) {
                        html += '<div class="popularity-bar-wrap" style="margin-bottom:10px;">' +
                            '<div class="popularity-bar-track"><div class="popularity-bar-fill" style="width:' + pop + '%"></div></div>' +
                            '<div class="popularity-num">' + pop + '</div></div>';
                    }
                    if (popHistory.length > 1) {
                        html += _renderSparkline(popHistory);
                    }
                    html += '</div>';
                }

                // Audio features
                if (tempo > 0) {
                    var afRows = [
                        ['Energy',          energy],
                        ['Danceability',    dance],
                        ['Valence',         valence],
                        ['Acousticness',    acoustic],
                        ['Instrumentalness',instru],
                        ['Speechiness',     speech],
                        ['Liveness',        live],
                    ];
                    html += '<div class="detail-section"><div class="detail-section-title">Audio Features</div>' +
                        '<div class="detail-kv-grid" style="margin-bottom:12px;">' +
                        '<div class="detail-kv"><div class="detail-kv-label">BPM</div><div class="detail-kv-value"><div class="bpm-display"><span class="bpm-num">' + Math.round(tempo) + '</span><span class="bpm-unit">bpm</span></div></div></div>' +
                        '<div class="detail-kv"><div class="detail-kv-label">Key / Mode</div><div class="detail-kv-value key-display">' + keyName + ' ' + modeName + '</div></div>' +
                        '<div class="detail-kv"><div class="detail-kv-label">Time Signature</div><div class="detail-kv-value">' + timeSig + '/4</div></div>' +
                        '<div class="detail-kv"><div class="detail-kv-label">Loudness</div><div class="detail-kv-value">' + loudness.toFixed(1) + ' dB</div></div>' +
                        '</div>' +
                        '<div class="audio-feature-bars">' +
                        afRows.map(function(r) {
                            var pct = Math.round(r[1] * 100);
                            return '<div class="af-row"><span class="af-label">' + r[0] + '</span>' +
                                '<div class="af-bar-track"><div class="af-bar-fill" style="width:' + pct + '%"></div></div>' +
                                '<span class="af-value">' + pct + '</span></div>';
                        }).join('') + '</div></div>';
                }

                // Assets
                html += '<div class="detail-section"><div class="detail-section-title">Assets</div>' +
                    '<div class="asset-dot-grid">' + assetDots + '</div></div>';

                // errors.txt format violations
                if (errorFormatIssues.length > 0) {
                    html += '<div class="detail-section" style="background:#fff5f5;border:1px solid #feb2b2;">' +
                        '<div class="detail-section-title" style="color:#c53030;">errors.txt format issues (' + errorFormatIssues.length + ')</div>' +
                        '<div style="font-size:0.8rem;color:#c53030;display:flex;flex-direction:column;gap:4px;">' +
                        errorFormatIssues.map(function(i) { return '<div>• ' + escHtml(i) + '</div>'; }).join('') +
                        '</div><div style="font-size:0.72rem;color:#9c4221;margin-top:8px;">Required format per line: MM:SS;error description;fix description, sorted ascending by time.</div></div>';
                }

                // FeatureFM platforms
                if (ffmLinks.length > 0) {
                    var ffmHtml = ffmLinks.map(function(lnk) {
                        return '<a href="' + escHtml(lnk.u) + '" target="_blank" class="badge yes-link">' + escHtml(lnk.n) + '</a>';
                    }).join(' ');
                    html += '<div class="detail-section"><div class="detail-section-title">Platforms</div><div style="display:flex;flex-wrap:wrap;gap:6px;">' + ffmHtml + '</div></div>';
                }

                // Financials
                var rate = (typeof USD_TO_GBP !== 'undefined') ? USD_TO_GBP : 0.745;
                var gbpEarnings = (parseFloat(earnings) * rate).toFixed(2);
                html += '<div class="detail-section"><div class="detail-section-title">Financials</div>' +
                    '<div class="detail-kv-grid">' +
                    '<div class="detail-kv"><div class="detail-kv-label">Total Earnings</div><div class="detail-kv-value">£' + gbpEarnings + '</div></div>' +
                    '<div class="detail-kv"><div class="detail-kv-label">ISRC</div><div class="detail-kv-value">' + escHtml(isrc || '—') + '</div></div>' +
                    '</div></div>';

                // Actions
                html += '<div class="detail-section"><div class="detail-section-title">Actions</div>' +
                    '<div style="display:flex;flex-wrap:wrap;gap:8px;">' +
                    '<button class="subform-btn btn-email" onclick="toggleUploadPicker(\'' + cardId + '\')">📤 Upload Asset</button>' +
                    '<button class="subform-btn btn-email" onclick="dispatchVerificationMarkViaEmail(\'' + cardId + '\',\'' + escJs(title) + '\')">👍 Verify</button>' +
                    '<button class="subform-btn btn-add" onclick="toggleErrorSubmissionForm(\'' + cardId + '\')">⚠️ Log Error</button>' +
                    '<button class="subform-btn btn-add" onclick="togglePublicationForm(\'' + cardId + '\')">🌐 Publication</button>' +
                    '<a href="' + escHtml(nasUrl) + '" class="subform-btn btn-add" target="_blank">📁 NAS</a>' +
                    '</div></div>';

                // Publication subform cloned from hidden card DOM (error subform already inserted above)
                var pubform = document.getElementById('pubform-' + cardId);
                if (pubform) html += pubform.outerHTML.replace('id="pubform-', 'id="detail-pubform-').replace(/style="display:none"/g, '');

                // Breadcrumb — use data-attribute event delegation to avoid escaping issues
                var bc = panel.querySelector('.breadcrumb');
                if (bc) {
                    var bcAlbum = albumName !== 'N/A'
                        ? '<a href="#" class="bc-album-link" data-album="' + escHtml(albumName) + '">' + escHtml(albumName) + '</a><span class="breadcrumb-sep">›</span>'
                        : '';
                    bc.innerHTML = '<a href="#" onclick="showPanel(\'artist\');return false;">Artists</a>' +
                        '<span class="breadcrumb-sep">›</span>' +
                        '<a href="#" onclick="showPanel(\'album\');return false;">Albums</a>' +
                        '<span class="breadcrumb-sep">›</span>' +
                        bcAlbum + '<span>' + escHtml(title) + '</span>';
                    bc.querySelectorAll('.bc-album-link').forEach(function(a) {
                        a.onclick = function(e) { e.preventDefault(); showPanel('album', { albumName: a.getAttribute('data-album') }); };
                    });
                }

                if (container) container.innerHTML = html;

            } catch(err) {
                console.error('renderDetailPanel error:', err);
                if (container) container.innerHTML = '<div class="detail-section" style="color:var(--danger);">Error rendering detail: ' + escHtml(String(err)) + '</div>';
            }
        }

        // ── SPARKLINE ──
        function _renderSparkline(history) {
            // history: array of ["yyyy-MM-dd", score] pairs, sorted ascending
            var W = 280, H = 56, pad = 4;
            var scores = history.map(function(p) { return p[1]; });
            var minS = Math.min.apply(null, scores);
            var maxS = Math.max.apply(null, scores);
            var range = maxS - minS || 1;
            var n = history.length;
            var pts = history.map(function(p, i) {
                var x = pad + (i / (n - 1)) * (W - pad * 2);
                var y = (H - pad) - ((p[1] - minS) / range) * (H - pad * 2);
                return x.toFixed(1) + ',' + y.toFixed(1);
            });
            var latest = scores[scores.length - 1];
            var earliest = scores[0];
            var delta = latest - earliest;
            var deltaStr = (delta >= 0 ? '+' : '') + delta;
            var colour = delta > 0 ? 'var(--success)' : delta < 0 ? 'var(--danger)' : 'var(--text-muted)';
            var firstDate = history[0][0];
            var lastDate  = history[history.length - 1][0];
            return '<div class="sparkline-wrap">' +
                '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" style="display:block;overflow:visible;">' +
                '<polyline points="' + pts.join(' ') + '" fill="none" stroke="' + colour + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' +
                // Dot at latest point
                '<circle cx="' + pts[pts.length-1].split(',')[0] + '" cy="' + pts[pts.length-1].split(',')[1] + '" r="3" fill="' + colour + '"/>' +
                '</svg>' +
                '<div class="sparkline-meta">' +
                '<span style="font-size:0.75rem;color:var(--text-muted);">' + escHtml(firstDate) + ' → ' + escHtml(lastDate) + '</span>' +
                '<span style="font-size:0.82rem;font-weight:700;color:' + colour + ';">' + deltaStr + ' pts</span>' +
                '</div></div>';
        }

        // ── HELPERS ──
        function assetEmoji(a) {
            var m = {cover:'🖼️',clip:'✂️',canvas:'🎥',reel:'🎬',mp3:'🔊',wav:'💿',lyrics:'📄',url:'🔗',stems:'🎚️',daw:'💻',mastered:'🎛️',albumreel:'🎞️'};
            return m[a] || '•';
        }
        function escHtml(s) {
            return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
        }
        function escJs(s) { return String(s||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'"); }

        // ── ARTIST FILTER (per-artist exact match, separate from text search) ──
        var activeArtistFilter = '';

        // ── SELECTION MODE ──
        function toggleSelectionMode() {
            selectionModeActive = !selectionModeActive;
            document.body.classList.toggle('selection-mode', selectionModeActive);
            document.getElementById('selectionModeBtn').innerText = selectionModeActive ? '☑️ Selecting...' : '☑️ Select Multiple';
            if (!selectionModeActive) clearAllSelections();
        }
        function onCardSelectionChanged(id) {
            var idx = selectedTrackIds.indexOf(id);
            var cb = document.getElementById('select-' + id);
            if (cb.checked && idx === -1) selectedTrackIds.push(id);
            else if (!cb.checked && idx > -1) selectedTrackIds.splice(idx, 1);
            updateBatchBar();
        }
        function clearAllSelections() {
            selectedTrackIds.forEach(function(id) { var cb = document.getElementById('select-' + id); if (cb) cb.checked = false; });
            selectedTrackIds = [];
            updateBatchBar();
            closeBatchFeedbackForm();
        }
        function updateBatchBar() {
            var bar = document.getElementById('floatingBatchBar');
            bar.classList.toggle('has-selection', selectedTrackIds.length > 0);
            document.getElementById('batchBarCount').innerText = selectedTrackIds.length + ' selected';
        }
        function openBatchFeedbackForm() {
            if (selectedTrackIds.length === 0) { alert('Select at least one track first.'); return; }
            var listEl = document.getElementById('batchFeedbackTrackList');
            listEl.innerHTML = '';
            selectedTrackIds.forEach(function(id) {
                var name = document.getElementById('select-' + id).getAttribute('data-song-name');
                var row = document.createElement('div');
                row.className = 'subform-row';
                row.style.gridTemplateColumns = '1fr';
                row.innerHTML = '<label style="font-weight:700;">' + name + '</label><input type="text" class="subform-input batch-issue-input" data-track-id="' + id + '" data-track-name="' + name.replace(/"/g,'&quot;') + '" placeholder="Issue for this track (leave blank to skip)" />';
                listEl.appendChild(row);
            });
            document.getElementById('batchFeedbackPanel').style.display = 'block';
        }
        function closeBatchFeedbackForm() { document.getElementById('batchFeedbackPanel').style.display = 'none'; }
        async function dispatchBatchFeedbackViaEmail() {
            var cards = document.querySelectorAll('.card');
            var sections = [];
            cards.forEach(function(c) {
                var ledger = c.querySelector('.staged-errors-ledger');
                if (!ledger || !ledger.children.length) return;
                var title = c.getAttribute('data-title') || c.id;
                var entries = [];
                ledger.querySelectorAll('.ledger-entry').forEach(function(e) {
                    var t = e.getAttribute('data-time') || '';
                    var issue = e.getAttribute('data-issue') || '';
                    var fix = e.getAttribute('data-fix') || '';
                    if (t && issue) entries.push({ time: t, error: issue, fix: fix });
                });
                if (entries.length) sections.push({ songName: title, entries: entries });
            });
            if (!sections.length) { alert('No staged error notes to send.'); return; }
            var ts = new Date().toISOString();
            var reportId = Date.now() + '-' + Math.random().toString(36).slice(2,7);
            var payload = { songName: 'BATCH', sections: sections, submittedBy: _spotifyUserEmail || 'unknown', submittedAt: ts };
            try {
                var resp = await fetch(WORKER_URL + '/github/push', { method:'POST', headers:{'Content-Type':'application/json'},
                    body: JSON.stringify({ path: 'error-reports/batch-' + reportId + '.json', content: toBase64(JSON.stringify(payload, null, 2)), message: 'Batch error report' }) });
                var res = await resp.json();
                if (res && res.success !== false) { alert('Sent! Will be processed on next run.'); closeBatchFeedbackForm(); }
                else { alert('Failed to send. Please try again.'); }
            } catch(e) { alert('Error: ' + e); }
        }
        function applyStatusFilter(s) {
            var cards = document.getElementsByClassName('summary-card');
            for (var i = 0; i < cards.length; i++) cards[i].classList.remove('active-filter');
            activeStatusFilter = (activeStatusFilter === s) ? 'ALL' : s;
            var tid = activeStatusFilter === 'ALL' ? 'btn-all' : activeStatusFilter === 'READY' ? 'btn-ready' : activeStatusFilter === 'MISSING' ? 'btn-missing' : 'btn-errors';
            document.getElementById(tid).classList.add('active-filter');
            evaluateControlMatrix();
        }
        function clearAllFilters() {
            document.getElementById('searchInput').value = '';
            document.getElementById('profileSelect').value = 'ALL';
            document.getElementById('albumContextSelect').value = 'ALL';
            document.getElementById('sortBySelect').value = 'none';
            activeSortKey = 'none'; activeStatusFilter = 'ALL'; activeArtistFilter = ''; activeSortDir = 'desc'; var sdb = document.getElementById('sortDirBtn'); if (sdb) sdb.textContent = 'Z-A';
            var stgEl = document.getElementById('stageSelect'); if (stgEl) stgEl.value = 'ALL';
            var finEl = document.getElementById('financialTierSelect'); if (finEl) finEl.value = 'ALL';
            var sglEl = document.getElementById('singleStatusSelect'); if (sglEl) sglEl.value = 'ALL';
            activeSelectedHasAssets = []; activeSelectedMissingAssets = [];
            var sc = document.getElementsByClassName('summary-card');
            for (var i = 0; i < sc.length; i++) sc[i].classList.remove('active-filter');
            document.getElementById('btn-all').classList.add('active-filter');
            var mb = document.getElementsByClassName('matrix-btn');
            for (var j = 0; j < mb.length; j++) mb[j].classList.remove('has-active','missing-active');
            evaluateControlMatrix();
        }
        function toggleMatrixTag(el, mode, assetName) {
            var arr = (mode === 'Has') ? activeSelectedHasAssets : activeSelectedMissingAssets;
            var idx = arr.indexOf(assetName.toLowerCase());
            if (idx > -1) { arr.splice(idx, 1); el.classList.remove(mode === 'Has' ? 'has-active' : 'missing-active'); }
            else { arr.push(assetName.toLowerCase()); el.classList.add(mode === 'Has' ? 'has-active' : 'missing-active'); }
            evaluateControlMatrix();
        }
        function toggleShelfMode() {
            shelfModeActive = !shelfModeActive;
            document.getElementById('shelfToggleBtn').innerText = '📁 Album Shelf: ' + (shelfModeActive ? 'ON' : 'OFF');
            localStorage.setItem('dashboard_shelf_mode', shelfModeActive ? '1' : '0');
            evaluateControlMatrix();
        }
        function applySortOrder() { activeSortKey = document.getElementById('sortBySelect').value; evaluateControlMatrix(); }
        function toggleSortDir() { activeSortDir = activeSortDir === 'desc' ? 'asc' : 'desc'; var btn = document.getElementById('sortDirBtn'); if (btn) btn.textContent = activeSortDir === 'asc' ? 'A-Z' : 'Z-A'; evaluateControlMatrix(); }

        function checkCardAgainstActiveMatrixRules(card, query, targetProfile, albumContextMode) {
            var status    = (card.getAttribute('data-status') || '').toLowerCase().trim();
            var errors    = (card.getAttribute('data-errors') || '').toLowerCase().trim();
            var profileAttr = card.getAttribute('data-profile') || 'N/A';
            var isAlbumDir = card.getAttribute('data-is-album') === 'TRUE';
            var missingArr = (card.getAttribute('data-missing') || '').toLowerCase().split(',').filter(Boolean);
            var existingArr = (card.getAttribute('data-existing') || '').toLowerCase().split(',').filter(Boolean);
            var cardText  = card.textContent.toLowerCase();
            var matchStatus = activeStatusFilter === 'ALL' ||
                (activeStatusFilter === 'ERRORS'  && errors === 'yes') ||
                (activeStatusFilter === 'MISSING' && status !== 'ready') ||
                status === activeStatusFilter.toLowerCase().trim();
            var matchProfile = targetProfile === 'ALL' ||
                (targetProfile === 'UNASSIGNED' && (profileAttr === 'N/A' || profileAttr === '')) ||
                profileAttr === targetProfile;
            var matchAlbumCtx = albumContextMode === 'ALL' ||
                (albumContextMode === 'ALBUM'  && isAlbumDir) ||
                (albumContextMode === 'LOOSE'  && !isAlbumDir);
            var matchHas     = activeSelectedHasAssets.every(function(a)  { return existingArr.indexOf(a) > -1; });
            var matchMissing = activeSelectedMissingAssets.every(function(a) { return missingArr.indexOf(a) > -1; });
            var matchSearch  = query ? cardText.indexOf(query) > -1 : true;
            // Exact artist filter (set when tapping an artist card — cleared by clearAllFilters)
            var matchArtist = !activeArtistFilter ||
                (card.getAttribute('data-artist-filter') || '').toLowerCase() === activeArtistFilter.toLowerCase();
            // Stage filter — maps dropdown values to status strings
            var stageFilterVal = (document.getElementById('stageSelect') ? document.getElementById('stageSelect').value : 'ALL');
            var stageStatusMap = { 'inprogressqueue': 'stem creation', 'inunreleasedalbum': 'daw creation', 'readynotinalbum': 'asset gathering', 'releasednotinalbum': 'ready', 'inreleasedalbum': 'ready' };
            var matchStage = stageFilterVal === 'ALL' || status === (stageStatusMap[stageFilterVal] || stageFilterVal);
            // Financial tier filter
            var financialFilterVal = (document.getElementById('financialTierSelect') ? document.getElementById('financialTierSelect').value : 'ALL');
            var convRate = (MLP && MLP.usdToGbpRate) || (1 / 1.3418);
            var cardEarnings = parseFloat(card.getAttribute('data-earnings-total')) || 0;
            var matchFinancial = financialFilterVal === 'ALL' || getFinancialTier(cardEarnings, convRate) === financialFilterVal;
            // Album/Single status filter (Spotify-verified single detection, independent of the
            // local-folder-based Album/Loose distinction used by albumContextMode above)
            var isSpotifySingle = card.getAttribute('data-is-single') === 'TRUE';
            var singleStatusVal = (document.getElementById('singleStatusSelect') ? document.getElementById('singleStatusSelect').value : 'ALL');
            var matchSingleStatus = singleStatusVal === 'ALL' ||
                (singleStatusVal === 'ALBUM_ONLY' && isAlbumDir  && !isSpotifySingle) ||
                (singleStatusVal === 'SINGLE_ONLY' && !isAlbumDir && isSpotifySingle) ||
                (singleStatusVal === 'BOTH'        && isAlbumDir  && isSpotifySingle) ||
                (singleStatusVal === 'NEITHER'     && !isAlbumDir && !isSpotifySingle);
            return matchStatus && matchProfile && matchAlbumCtx && matchHas && matchMissing && matchSearch && matchArtist && matchStage && matchFinancial && matchSingleStatus;
        }

        function evaluateControlMatrix() {
            // Render cards from data if cardsContainer is empty (first load or refresh)
            var cC = document.getElementById('cardsContainer');
            if (cC && MLP.tracks.length && cC.children.length === 0) {
                var frag = document.createDocumentFragment();
                MLP.tracks.forEach(function(t) {
                    var div = document.createElement('div');
                    div.innerHTML = buildCardHtml(t);
                    var card = div.firstChild;
                    // Wire album links
                    card.querySelectorAll('.album-link').forEach(function(a) { a.onclick = function(e) { e.preventDefault(); showPanel('album', { albumName: a.getAttribute('data-album') }); }; });
                    frag.appendChild(card);
                });
                cC.appendChild(frag);
            }
            var q    = document.getElementById('searchInput').value.toLowerCase().trim();
            var prof = document.getElementById('profileSelect').value;
            var ctx  = document.getElementById('albumContextSelect').value;
            var liveCards = document.getElementsByClassName('card');
            var cardsArr  = Array.prototype.slice.call(liveCards);
            if (activeSortKey !== 'none') {
                if (activeSortKey === 'confidence') {
                    cardsArr.sort(function(a,b) {
                        var idA = a.id, idB = b.id;
                        var tA = _trackMap[idA], tB = _trackMap[idB];
                        var scoreA = computeEffectiveConfidence(idA, tA);
                        var scoreB = computeEffectiveConfidence(idB, tB);
                        return activeSortDir === 'asc' ? scoreA - scoreB : scoreB - scoreA;
                    });
                } else if (activeSortKey === 'name') {
                    cardsArr.sort(function(a,b) {
                        var nA = (a.getAttribute('data-title')||'').toLowerCase();
                        var nB = (b.getAttribute('data-title')||'').toLowerCase();
                        return activeSortDir === 'asc' ? nA.localeCompare(nB) : nB.localeCompare(nA);
                    });
                } else if (activeSortKey === 'release-date') {
                    cardsArr.sort(function(a,b) {
                        var dA = a.getAttribute('data-release-date') || '';
                        var dB = b.getAttribute('data-release-date') || '';
                        return activeSortDir === 'asc' ? dA.localeCompare(dB) : dB.localeCompare(dA);
                    });
                } else {
                    var attr = 'data-earnings-' + activeSortKey.replace('earnings-','');
                    cardsArr.sort(function(a,b) {
                        var vA = parseFloat(a.getAttribute(attr))||0, vB = parseFloat(b.getAttribute(attr))||0;
                        return activeSortDir === 'asc' ? vA - vB : vB - vA;
                    });
                }
            }
            var visible = 0;
            var gC = document.getElementById('albumGroupsContainer');
            var cC = document.getElementById('cardsContainer');
            gC.innerHTML = ''; gC.style.display = 'none';
            var map = {}, singles = [];
            for (var i = 0; i < cardsArr.length; i++) {
                var c = cardsArr[i];
                var matched = checkCardAgainstActiveMatrixRules(c, q, prof, ctx);
                if (matched) {
                    visible++;
                    if (shelfModeActive) {
                        if (c.getAttribute('data-is-album') === 'TRUE') {
                            var g = c.getAttribute('data-album-group') || 'N/A';
                            if (!map[g]) map[g] = [];
                            map[g].push(c);
                        } else { singles.push(c); }
                    } else { c.style.display = 'flex'; cC.appendChild(c); }
                } else { c.style.display = 'none'; }
            }
            if (shelfModeActive && visible > 0) {
                cC.style.display = 'none'; gC.style.display = 'block';
                Object.keys(map).sort().forEach(function(k) {
                    var sec = document.createElement('div'); sec.className = 'album-group-section';
                    var h = document.createElement('div'); h.className = 'album-group-header';
                    h.innerHTML = '💿 <a href="#" class="shelf-album-link" data-album="' + escHtml(k) + '" style="color:inherit;text-decoration:none;">' + escHtml(k) + '</a> <span style="font-size:0.78rem;font-weight:500;color:var(--text-muted);">(' + map[k].length + ' Tracks)</span>';
                    sec.appendChild(h);
                    map[k].forEach(function(card) { card.style.display = 'flex'; sec.appendChild(card); });
                    gC.appendChild(sec);
                });
                // Wire album shelf links via event delegation (avoids inline escaping)
                gC.querySelectorAll('.shelf-album-link').forEach(function(a) {
                    a.onclick = function(e) { e.preventDefault(); showPanel('album', { albumName: a.getAttribute('data-album') }); };
                });
                if (singles.length > 0) {
                    var ss = document.createElement('div'); ss.className = 'album-group-section singles-section';
                    var sh = document.createElement('div'); sh.className = 'album-group-header';
                    sh.innerHTML = '🎵 Singles <span style="font-size:0.78rem;font-weight:500;color:var(--text-muted);">(' + singles.length + ' Tracks)</span>';
                    ss.appendChild(sh);
                    singles.forEach(function(card) { card.style.display = 'flex'; ss.appendChild(card); });
                    gC.appendChild(ss);
                }
            } else if (!shelfModeActive) { cC.style.display = 'flex'; }
            document.getElementById('emptyState').style.display = (visible === 0) ? 'block' : 'none';
            var fL = [];
            if (activeStatusFilter !== 'ALL') fL.push('<span>Category:</span> ' + (activeStatusFilter === 'MISSING' ? 'In Queue Gates' : activeStatusFilter));
            if (activeArtistFilter) fL.push('<span>Artist:</span> ' + escHtml(activeArtistFilter));
            if (q) fL.push('<span>Search:</span> "' + escHtml(q) + '"');
            if (prof !== 'ALL') fL.push('<span>Account:</span> ' + escHtml(prof));
            if (activeSelectedHasAssets.length)    fL.push('<span>Has:</span> '     + activeSelectedHasAssets.join(', '));
            if (activeSelectedMissingAssets.length) fL.push('<span>Missing:</span> ' + activeSelectedMissingAssets.join(', '));
            var pnl = document.getElementById('queryContextPanel');
            if (fL.length) { document.getElementById('contextDescription').innerHTML = fL.join(' • '); pnl.style.display = 'flex'; }
            else pnl.style.display = 'none';
        }

        function exportFilteredSongTitles() {
            var cards = document.getElementsByClassName('card');
            var q = document.getElementById('searchInput').value.toLowerCase().trim();
            var prof = document.getElementById('profileSelect').value;
            var ctx = document.getElementById('albumContextSelect').value;
            var map = {}; var tot = 0;
            for (var i = 0; i < cards.length; i++) {
                var c = cards[i];
                if (checkCardAgainstActiveMatrixRules(c, q, prof, ctx)) {
                    tot++;
                    var t = c.getAttribute('data-title');
                    var g = c.getAttribute('data-album-group') || 'N/A';
                    if (!map[g]) map[g] = [];
                    map[g].push(t);
                }
            }
            var payload = activeStatusFilter + ' Tracks\n\n';
            Object.keys(map).sort().forEach(function(k) { payload += '💿 ' + k + '\n' + map[k].map(function(t){ return '  - '+t; }).join('\n') + '\n\n'; });
            navigator.clipboard.writeText(payload.trim()).then(function(){ alert('Exported ' + tot + ' tracks.'); }).catch(function(){ alert('Clipboard failed.'); });
        }

        // ── PIPELINE UTILITIES (Point 6 — filter UI pending HTML additions) ──
        window.PIPELINE_STAGES = {
            'inprogressqueue':    'Stem Creation',
            'readynotinalbum':    'Asset Gathering',
            'releasednotinalbum': 'Released',
            'inunreleasedalbum':  'DAW Creation',
            'inreleasedalbum':    'Released Context'
        };
        function getFinancialTier(earningsTotal, rate) {
            var gbp = earningsTotal * rate;
            if (gbp >= 100.0) return 'tier-high';
            if (gbp > 0.0)    return 'tier-monetized';
            return 'tier-zero';
        }
        window.getFinancialTier = getFinancialTier;

        // ── TRACK DETAIL POPUP (Point 9) ──
        function openTrackDetailPopup(trackId) {
            if (!MLP || !Array.isArray(MLP.tracks)) return;
            var track = _trackMap[trackId];
            if (!track) return;

            var backdrop = document.getElementById('trackDetailPopupBackdrop');
            if (!backdrop) {
                var shell = document.createElement('div');
                shell.id = 'trackDetailPopupBackdrop';
                shell.style.cssText = 'display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.65);z-index:1500;align-items:center;justify-content:center;padding:16px;';
                shell.innerHTML = '<div style="background:var(--surface);border-radius:12px;padding:20px;max-width:600px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:var(--shadow-md);">' +
                    '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;">' +
                    '<h2 id="popupTrackTitle" style="margin:0;font-size:1.2rem;"></h2>' +
                    '<button onclick="closeTrackDetailPopup()" style="background:transparent;border:none;font-size:1.2rem;cursor:pointer;color:var(--text-muted);">&times;</button>' +
                    '</div><div id="popupModalInteractiveContent"></div></div>';
                document.body.appendChild(shell);
                backdrop = document.getElementById('trackDetailPopupBackdrop');
            }

            document.getElementById('popupTrackTitle').innerText = track.title || trackId;

            var rate = (MLP && MLP.usdToGbpRate) || (1 / 1.3418);
            var gbp = ((track.earningsTotal || 0) * rate).toFixed(2);
            var tier = getFinancialTier(track.earningsTotal || 0, rate);
            var tierLabel = { 'tier-high': '🟢 High (£100+)', 'tier-monetized': '🟡 Monetised', 'tier-zero': '⚪ £0' }[tier] || tier;

            var fields = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:0.8rem;margin-top:10px;">' +
                '<div><strong>ISRC:</strong> ' + escHtml(track.isrc || 'N/A') + '</div>' +
                '<div><strong>Album:</strong> ' + escHtml(track.albumGroup || 'Loose Single') + '</div>' +
                '<div><strong>Artist:</strong> ' + escHtml(track.spotifyArtist || 'N/A') + '</div>' +
                '<div><strong>Stage:</strong> ' + escHtml(track.status || 'N/A') + '</div>' +
                '<div><strong>Earnings:</strong> £' + gbp + '</div>' +
                '<div><strong>Tier:</strong> ' + tierLabel + '</div>' +
                '<div><strong>Release Date:</strong> ' + escHtml(track.spotifyReleaseDate || 'N/A') + '</div>' +
                '<div><strong>Popularity:</strong> ' + (track.spotifyPopularity || 0) + '</div>' +
                '</div>';

            // Timeline loaded on-demand from analytics-spotify.json
            var timelineHtml = '<div style="margin-top:14px;">' +
                '<button onclick="loadPopupTimeline(\'' + escHtml(trackId) + '\')" style="background:var(--accent);color:#fff;border:none;border-radius:6px;padding:6px 12px;font-size:0.78rem;cursor:pointer;">Load Stream Timeline</button>' +
                '<div id="popup-timeline-' + escHtml(trackId) + '" style="margin-top:8px;"></div></div>';

            document.getElementById('popupModalInteractiveContent').innerHTML = fields +
                '<hr style="border:none;border-top:1px solid var(--border);margin:12px 0;">' + timelineHtml;

            backdrop.style.display = 'flex';
        }

        async function loadPopupTimeline(trackId) {
            var el = document.getElementById('popup-timeline-' + trackId);
            if (!el) return;
            el.innerHTML = '<span style="font-size:0.75rem;color:var(--text-muted);">Loading…</span>';
            try {
                var track = _trackMap[trackId];
                var safeName = (track && track.title) ? track.title.replace(/[^a-zA-Z0-9]/g, '_') : trackId;
                var file = await ghGetFile('analytics/' + safeName + '-analytics-spotify.json');
                if (!file || !file.content) { el.innerHTML = '<span style="font-size:0.75rem;color:var(--text-muted);">No timeline data.</span>'; return; }
                var data = JSON.parse(fromBase64(file.content));
                var timeline = (data.song_timeline || []).filter(function(d) { return d && d.date; }).sort(function(a,b) { return a.date.localeCompare(b.date); });
                if (!timeline.length) { el.innerHTML = '<span style="font-size:0.75rem;color:var(--text-muted);">No stream entries.</span>'; return; }
                var maxS = Math.max.apply(null, timeline.map(function(d) { return d.streams || 0; })) || 1;
                var pts = timeline.map(function(d, i) {
                    var x = timeline.length > 1 ? (i / (timeline.length - 1)) * 100 : 50;
                    var y = 100 - (((d.streams || 0) / maxS) * 100);
                    return x + ',' + y;
                }).join(' ');
                el.innerHTML = '<div style="background:var(--bg-card);border:1px solid var(--border);height:80px;border-radius:6px;padding:4px;">' +
                    '<svg viewBox="0 0 100 100" preserveAspectRatio="none" style="width:100%;height:100%;overflow:visible;">' +
                    '<polyline points="' + pts + '" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round"/></svg></div>' +
                    '<div style="display:flex;justify-content:space-between;font-size:0.7rem;color:var(--text-muted);margin-top:2px;">' +
                    '<span>' + timeline[0].date + '</span><span>Peak: ' + maxS.toLocaleString() + '</span><span>' + timeline[timeline.length-1].date + '</span></div>';
            } catch(e) { el.innerHTML = '<span style="font-size:0.75rem;color:var(--text-muted);">Failed to load.</span>'; }
        }

        function closeTrackDetailPopup() {
            var b = document.getElementById('trackDetailPopupBackdrop');
            if (b) b.style.display = 'none';
        }
        window.openTrackDetailPopup = openTrackDetailPopup;
        window.closeTrackDetailPopup = closeTrackDetailPopup;

        // ── UPLOAD / ADMIN / ERROR / PUBLICATION ──
        function toggleErrorSubmissionForm(id) { var p = document.getElementById('subform-' + id); if(p) p.style.display = (p.style.display === 'block') ? 'none' : 'block'; }
        function togglePublicationForm(id) { var p = document.getElementById('pubform-' + id); if(p) p.style.display = (p.style.display === 'block') ? 'none' : 'block'; }
        // Staged files for current upload session: [{file, assetType, songName, acceptAttr, expectedExt}]
        var _stagedUploadFiles = [];
        var _uploadAssetCtx = null; // {id, songName, assetType, acceptAttr, expectedExt}

        function toggleUploadPicker(id) {
            currentUploadModalTrackId = id;
            _stagedUploadFiles = [];
            var card = document.getElementById(id);
            var title = card ? (card.getAttribute('data-title') || 'this track') : 'this track';
            document.getElementById('uploadModalTitle').innerText = 'Missing items: ' + title;
            var uploadEls = card ? card.querySelectorAll('.uploadable[onclick*="triggerAssetUpload"]') : [];
            var seenTypes = {}; var rowsHtml = '';
            uploadEls.forEach(function(el) {
                var m = el.getAttribute('onclick').match(/triggerAssetUpload\(("(?:[^"\\]|\\.)*"),("(?:[^"\\]|\\.)*"),"([^"]+)","([^"]*)","([^"]*)"\)/);
                if (!m) return;
                var assetType = m[3], acceptAttr = m[4], expectedExt = m[5];
                if (seenTypes[assetType]) return; seenTypes[assetType] = true;
                var songName = JSON.parse(m[2].replace(/\\'/g,"'"));
                var iconMap = {Cover:'🖼️',Lyrics:'📄',Canvas:'🎥',Clip:'✂️',Reel:'🎬',AlbumReel:'🎞️'};
                rowsHtml += '<div class="upload-modal-row"><span class="upload-modal-row-label">' + (iconMap[assetType]||'📤') + ' ' + assetType + '</span>'
                    + '<button class="upload-modal-row-btn" onclick=\'openUploadRowAction("' + id + '","' + songName.replace(/"/g,'\\"').replace(/'/g,"\\'") + '","' + assetType + '","' + acceptAttr + '","' + expectedExt + '")\'>Choose File</button></div>';
            });
            document.getElementById('uploadModalRows').innerHTML = rowsHtml || '<div class="upload-modal-empty">Nothing missing on this track. 🎉</div>';
            document.getElementById('uploadStagedList').innerHTML = '';
            document.getElementById('uploadProgressMsg').style.display = 'none';
            document.getElementById('uploadProgressMsg').textContent = '';
            document.getElementById('uploadOkBtn').style.display = '';
            document.getElementById('lyricsEntryPanel').classList.remove('active');
            document.getElementById('uploadModalBackdrop').classList.add('active');
        }

        function _renderStagedList() {
            var el = document.getElementById('uploadStagedList');
            if (!_stagedUploadFiles.length) { el.innerHTML = ''; return; }
            var html = '<div style="font-size:0.78rem;font-weight:700;margin:10px 0 4px;color:var(--text-muted);">Staged for upload (' + _stagedUploadFiles.length + '):</div>';
            _stagedUploadFiles.forEach(function(item, idx) {
                html += '<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border);font-size:0.8rem;">'
                    + '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'
                    + escHtml(item.assetType) + ' — ' + escHtml(item.file.name) + '</span>'
                    + '<button onclick="_removeStagedFile(' + idx + ')" style="background:transparent;border:none;color:var(--danger,#e53e3e);font-size:1rem;cursor:pointer;flex-shrink:0;">✕</button></div>';
            });
            el.innerHTML = html;
        }

        function _removeStagedFile(idx) {
            _stagedUploadFiles.splice(idx, 1);
            _renderStagedList();
        }

        async function submitStagedUploads() {
            if (!_stagedUploadFiles.length) { closeUploadModal(); return; }
            var btn = document.getElementById('uploadOkBtn');
            var msg = document.getElementById('uploadProgressMsg');
            btn.style.display = 'none';
            msg.style.display = 'block';
            var total = _stagedUploadFiles.length;
            var failed = [];
            for (var i = 0; i < total; i++) {
                var item = _stagedUploadFiles[i];
                msg.textContent = 'Uploading ' + (i+1) + '/' + total + ': ' + item.file.name;
                var ok = await _doUploadFile(item);
                if (!ok) failed.push(item.file.name);
            }
            if (failed.length) {
                msg.style.color = 'var(--danger,#e53e3e)';
                msg.textContent = 'Failed: ' + failed.join(', ');
                btn.textContent = 'Close'; btn.style.display = '';
            } else {
                msg.style.color = '#1DB954';
                msg.textContent = 'All ' + total + ' file' + (total > 1 ? 's' : '') + ' uploaded successfully!';
                setTimeout(function() { closeUploadModal(); }, 1500);
            }
        }

        async function _doUploadFile(item) {
            return new Promise(function(resolve) {
                var reader = new FileReader();
                reader.onload = async function() {
                    try {
                        var ghName = item.songName.replace(/ /g,'_') + '__' + item.assetType + '__' + item.file.name;
                        var resp = await fetch(WORKER_URL + '/github/push', { method:'POST', headers:{'Content-Type':'application/json'},
                            body: JSON.stringify({path: 'uploads/'+ghName, content: reader.result.split(',')[1], message: 'Upload: '+ghName}) });
                        var res = await resp.json();
                        resolve(res && res.success !== false);
                    } catch(e) { resolve(false); }
                };
                reader.onerror = function() { resolve(false); };
                reader.readAsDataURL(item.file);
            });
        }

        function closeUploadModal() {
            document.getElementById('uploadModalBackdrop').classList.remove('active');
            document.getElementById('lyricsEntryPanel').classList.remove('active');
            document.getElementById('lyricsTextarea').value = '';
            document.getElementById('uploadOkBtn').textContent = 'Upload All';
            _stagedUploadFiles = [];
            currentLyricsTrackContext = null;
        }
        function closeAdminPanel() { showPanel('artist'); } // legacy — redirect to artist tab

        function closeDiagnosticsPanel() { }
        async function openDiagnosticsPanel() { showPanel('admin'); }

        async function refreshDiagnostics() {
            // Defer one tick so _activatePanel has finished switching the DOM
            await new Promise(function(r){ setTimeout(r, 50); });
            var el = document.getElementById('diagnosticsContent');
            if (!el) return;
            el.innerHTML = '<div style="color:var(--text-muted);padding:4px 0;">Running…</div>';
            try { await _runDiagnostics(el); } catch(e) { el.innerHTML = '<div style="color:#e53e3e;padding:4px 0;">Error: ' + String(e) + '</div>'; }
        }

        async function _runDiagnostics(el) {
            function row(label, value, ok) {
                var colour = ok === true ? '#1DB954' : ok === false ? '#e53e3e' : 'var(--text)';
                return '<div style="display:flex;gap:8px;padding:5px 0;border-bottom:1px solid var(--border);">'
                    + '<span style="flex:0 0 200px;font-weight:600;color:var(--text-muted);">' + label + '</span>'
                    + '<span style="flex:1;color:' + colour + ';word-break:break-all;">' + escHtml(String(value)) + '</span></div>';
            }
            function section(title) {
                return '<div style="font-size:0.75rem;font-weight:800;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-muted);margin:14px 0 4px;">' + title + '</div>';
            }
            function pending(label) {
                return '<div id="diag-' + label.replace(/[^a-z0-9]/gi,'_') + '" style="display:flex;gap:8px;padding:5px 0;border-bottom:1px solid var(--border);">'
                    + '<span style="flex:0 0 200px;font-weight:600;color:var(--text-muted);">' + label + '</span>'
                    + '<span style="flex:1;color:var(--text-muted);">…</span></div>';
            }
            function updatePending(label, value, ok) {
                var id = 'diag-' + label.replace(/[^a-z0-9]/gi,'_');
                var el2 = document.getElementById(id);
                if (el2) el2.outerHTML = row(label, value, ok);
            }

            // ── Render sync rows immediately ──────────────────────────────────
            var html = '';

            html += section('Dashboard Data');
            html += row('Version', MLP.version || '(unknown)', null);
            html += row('Generated', MLP.generated || '(unknown)', null);
            html += row('Tracks loaded', MLP.tracks.length, MLP.tracks.length > 0);
            html += row('Artists', (MLP.artists||[]).length, null);
            html += row('Companies', (MLP.companies||[]).join(', ') || '(none)', null);
            html += row('USD→GBP rate', MLP.usdToGbpRate || '(missing)', null);

            html += section('Spotify Client');
            var clientId = spotifyGetClientId();
            html += row('Client ID in HTML', clientId ? clientId.slice(0,8)+'…' : '(EMPTY — auth will fail)', !!clientId);
            html += row('Redirect URI', SPOTIFY_REDIRECT_URI, null);
            html += row('Access token', _spotifyAccessToken ? '✓ present (' + _spotifyAccessToken.slice(0,8) + '…)' : '✗ not set', !!_spotifyAccessToken);
            html += row('Refresh token', sessionStorage.getItem('sp_refresh') ? '✓ present' : '✗ not set', !!sessionStorage.getItem('sp_refresh'));
            html += row('Mode', _spotifyMode || '(not connected)', _spotifyMode !== null);
            html += row('Device ID', _spotifyDeviceId || '(none)', null);
            html += row('User email', _spotifyUserEmail || '(not verified)', !!_spotifyUserEmail);

            html += section('Library Summary');
            var statuses = {};
            MLP.tracks.forEach(function(t) { statuses[t.status] = (statuses[t.status]||0)+1; });
            Object.keys(statuses).sort().forEach(function(s) { html += row(s, statuses[s] + ' tracks', null); });
            var withErrors = MLP.tracks.filter(function(t){ return t.errors === 'Yes'; }).length;
            html += row('Tracks with errors', withErrors, withErrors === 0);
            html += row('Confidence scores loaded', Object.keys(_confidenceScores).length, null);
            html += row('Pending errors', _pendingErrors.length, _pendingErrors.length === 0);

            html += section('Environment');
            html += row('URL', window.location.href, null);
            html += row('User agent', navigator.userAgent.slice(0,60)+'…', null);
            html += row('sessionStorage', (function(){ try { sessionStorage.setItem('_d','1'); sessionStorage.removeItem('_d'); return 'available'; } catch(e){ return 'unavailable'; } })(), null);
            html += row('Service worker', 'serviceWorker' in navigator ? '✓ supported' : '✗ not supported', 'serviceWorker' in navigator);

            // Placeholders for async checks
            html += section('Cloudflare Worker');
            html += row('Worker URL', WORKER_URL, null);
            html += pending('Worker reachable');

            html += section('GitHub Folders');
            var folders = ['uploads', 'imports', 'error-reports', 'analytics'];
            folders.forEach(function(f) { html += pending(f + '/'); });

            el.innerHTML = html;

            // ── Async checks — update placeholders in place ───────────────────
            var fetchTimeout = function(url, opts, ms) {
                var ctrl = new AbortController();
                var t = setTimeout(function(){ ctrl.abort(); }, ms || 8000);
                return fetch(url, Object.assign({}, opts, { signal: ctrl.signal })).finally(function(){ clearTimeout(t); });
            };

            // Worker ping
            try {
                var wResp = await fetchTimeout(WORKER_URL + '/github/list?path=uploads', {}, 6000);
                var workerOk = wResp.status < 500;
                updatePending('Worker reachable', workerOk ? '✓ HTTP ' + wResp.status : '✗ HTTP ' + wResp.status, workerOk);
                // Parse the response for uploads count while we're at it
                try {
                    var wJson = await wResp.json();
                    updatePending('uploads/', Array.isArray(wJson) ? wJson.length + ' file(s)' : '(unexpected response)', Array.isArray(wJson));
                    folders = ['imports', 'error-reports', 'analytics']; // skip uploads, already done
                } catch(e) { /* leave uploads pending */ }
            } catch(e) {
                updatePending('Worker reachable', '✗ ' + (e.name === 'AbortError' ? 'Timed out (6s)' : e.message), false);
            }

            // Remaining folders
            for (var fi = 0; fi < folders.length; fi++) {
                var fname = folders[fi];
                try {
                    var files = await Promise.race([
                        ghList(fname),
                        new Promise(function(_,rej){ setTimeout(function(){ rej(new Error('Timed out')); }, 6000); })
                    ]);
                    updatePending(fname + '/', Array.isArray(files) ? files.length + ' file(s)' : '(error)', Array.isArray(files));
                } catch(e) { updatePending(fname + '/', '✗ ' + e.message, false); }
            }
        }
        function triggerAdminImport(importType) {
            var input = document.createElement('input');
            input.type = 'file'; input.accept = '.csv,.zip,.png,.jpg,.jpeg,.mp4,.mp3,.txt'; input.multiple = true;
            input.onchange = function() {
                if (!input.files || !input.files.length) return;
                uploadFilesToGitHub(Array.from(input.files), importType);
            };
            input.click();
        }

        async function uploadFilesToGitHub(files, hintType) {
            var total = files.length, done = 0, failed = [];
            for (var i = 0; i < files.length; i++) {
                var r = await uploadOneFileToGitHub(files[i], hintType);
                if (r) done++; else failed.push(files[i].name);
            }
            if (failed.length) { alert(done + '/' + total + ' uploaded. Failed: ' + failed.join(', ')); }
            else { alert(total + ' file' + (total!==1?'s':'') + ' uploaded. Will be picked up on the next run.'); }
        }

        async function uploadOneFileToGitHub(file, hintType) {
            if (file.size > 48*1024*1024) { alert(file.name + ' is too large (max 48MB).'); return false; }
            var name = file.name.toLowerCase(), folder, ghName;
            if (hintType || name.endsWith('.csv') || name.endsWith('.zip')) {
                var importType = hintType || null, snapshotDate = '';
                if (!importType) {
                    if (/^excruciating_details/.test(name)) importType = 'distrokid';
                    else if (/-timelines?\.csv$/.test(name)) importType = 'song_timeline';
                    else if (/-songs-1day/.test(name)) importType = 'artist_songs_1day';
                }
                if (!importType) { importType = prompt('Import type for ' + file.name + ':\ndistrokid / spotify_audience / artist_songs_1day / song_timeline'); if (!importType) return false; }
                if (importType === 'artist_songs_1day') {
                    var dm = file.name.match(/(\d{1,2})-(\d{1,2})\s*(?:\.\w+)?$/);
                    if (dm) {
                        var d2 = new Date(new Date().getFullYear(), parseInt(dm[2],10)-1, parseInt(dm[1],10));
                        if (d2 > new Date()) d2 = new Date(d2.getFullYear()-1, d2.getMonth(), d2.getDate());
                        d2.setDate(d2.getDate()+1);
                        snapshotDate = d2.getFullYear() + '-' + String(d2.getMonth()+1).padStart(2,'0') + '-' + String(d2.getDate()).padStart(2,'0');
                    } else { snapshotDate = prompt('Snapshot date for ' + file.name + ' (YYYY-MM-DD):'); if (!snapshotDate) return false; }
                }
                folder = 'imports'; ghName = importType + '__' + (snapshotDate||'nodate') + '__' + file.name;
            } else {
                var extMap = { png:'Cover', jpg:'Cover', jpeg:'Cover', mp4:'Canvas', mp3:'Clip', txt:'Lyrics' };
                var ext2 = (file.name.split('.').pop()||'').toLowerCase();
                var assetType = extMap[ext2] || 'Cover';
                var sname = prompt('Song name for ' + file.name + ':'); if (!sname) return false;
                folder = 'uploads'; ghName = sname.replace(/ /g,'_') + '__' + assetType + '__' + file.name;
            }
            return new Promise(function(resolve) {
                var reader = new FileReader();
                reader.onload = async function() {
                    var b64 = reader.result.split(',')[1];
                    try {
                        var resp = await fetch(WORKER_URL + '/github/push', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({path: folder+'/'+ghName, content: b64, message: 'Upload: '+ghName}) });
                        var res = await resp.json();
                        resolve(res && res.success !== false);
                    } catch(e) { resolve(false); }
                };
                reader.onerror = function() { resolve(false); };
                reader.readAsDataURL(file);
            });
        }
        function openUploadRowAction(id, songName, assetType, acceptAttr, expectedExt) {
            if (assetType === 'Lyrics') {
                currentLyricsTrackContext = { id: id, songName: songName, acceptAttr: acceptAttr, expectedExt: expectedExt };
                document.getElementById('uploadModalTitle').innerText = 'Lyrics: ' + songName;
                document.getElementById('uploadModalRows').innerHTML = '';
                document.getElementById('uploadModalBackdrop').classList.add('active');
                document.getElementById('lyricsEntryPanel').classList.add('active');
                document.getElementById('lyricsTextarea').focus(); return;
            }
            // Open file picker; add chosen file(s) to staged list
            _uploadAssetCtx = { id: id, songName: songName, assetType: assetType, acceptAttr: acceptAttr, expectedExt: expectedExt };
            var input = document.createElement('input');
            input.type = 'file'; input.accept = acceptAttr || '*'; input.multiple = true;
            input.onchange = function() {
                if (!input.files || !input.files.length) return;
                for (var i = 0; i < input.files.length; i++) {
                    var file = input.files[i];
                    var ext = (file.name.split('.').pop()||'').toLowerCase();
                    if (expectedExt && ext !== expectedExt) { alert('Expected a .' + expectedExt + ' file. Skipping: ' + file.name); continue; }
                    _stagedUploadFiles.push({ file: file, assetType: assetType, songName: songName, acceptAttr: acceptAttr, expectedExt: expectedExt });
                }
                _renderStagedList();
            };
            input.click();
        }
        function switchLyricsToFileUpload() { if (!currentLyricsTrackContext) return; var c = currentLyricsTrackContext; openUploadRowAction(c.id, c.songName, 'Lyrics', c.acceptAttr, c.expectedExt); }
        async function dispatchLyricsTextViaEmail() {
            if (!currentLyricsTrackContext) return;
            var text = document.getElementById('lyricsTextarea').value.trim();
            if (!text) { alert('Type or paste the lyrics first, or tap "Upload a .txt file instead".'); return; }
            var name = currentLyricsTrackContext.songName;
            var safeName = name.replace(/ /g,'_');
            var filename = safeName + '-lyrics.txt';
            var path = 'uploads/' + safeName + '__Lyrics__' + filename;
            try {
                var b64 = toBase64(text);
                var resp = await fetch(WORKER_URL + '/github/push', { method:'POST', headers:{'Content-Type':'application/json'},
                    body: JSON.stringify({ path: path, content: b64, message: 'Lyrics upload: ' + name }) });
                var res = await resp.json();
                if (res && res.success !== false) { alert('Lyrics uploaded! Will be saved on next run.'); closeUploadModal(); }
                else { alert('Upload failed. Please try again.'); }
            } catch(e) { alert('Error: ' + e); }
        }
        async function dispatchPublicationUpdateViaEmail(id, name) {
            var platform = document.getElementById('pub-platform-' + id).value.trim();
            var date     = document.getElementById('pub-date-' + id).value.trim();
            var link     = document.getElementById('pub-link-' + id).value.trim();
            if (!platform) { alert('Enter at least a platform name.'); return; }
            var ts = new Date().toISOString();
            var safeName = name.replace(/ /g,'_');
            var payload = { type: 'publication', songName: name, platform: platform, pubDate: date, link: link, submittedBy: _spotifyUserEmail || 'unknown', submittedAt: ts };
            var path = 'imports/publication__' + ts.slice(0,10) + '__' + safeName + '.json';
            try {
                var resp = await fetch(WORKER_URL + '/github/push', { method:'POST', headers:{'Content-Type':'application/json'},
                    body: JSON.stringify({ path: path, content: toBase64(JSON.stringify(payload, null, 2)), message: 'Publication: ' + name }) });
                var res = await resp.json();
                if (res && res.success !== false) { alert('Saved! Publication status will update on next run.'); togglePublicationForm(id); }
                else { alert('Failed to save publication update. Please try again.'); }
            } catch(e) { alert('Error: ' + e); }
        }
        async function dispatchVerificationMarkViaEmail(id, name) {
            var ts = new Date().toISOString();
            var safeName = name.replace(/ /g,'_');
            var payload = { type: 'verify', songName: name, timestamp: ts, submittedBy: _spotifyUserEmail || 'unknown' };
            var path = 'imports/verify__' + ts.slice(0,10) + '__' + safeName + '.json';
            try {
                var resp = await fetch(WORKER_URL + '/github/push', { method:'POST', headers:{'Content-Type':'application/json'},
                    body: JSON.stringify({ path: path, content: toBase64(JSON.stringify(payload, null, 2)), message: 'Verify: ' + name }) });
                var res = await resp.json();
                if (res && res.success !== false) { alert('Verified! Will be recorded on next run.'); }
                else { alert('Failed to record verification. Please try again.'); }
            } catch(e) { alert('Error: ' + e); }
        }
        var stagedErrorEntries = {}; // id -> [{time, error, fix}]
        var TIME_MMSS_PATTERN = /^\d{1,2}:\d{2}$/;

        function stageLocalErrorEntry(id, name) {
            var t = document.getElementById('input-stamp-' + id).value.trim();
            var issue = document.getElementById('input-issue-' + id).value.trim();
            var f = document.getElementById('input-fix-' + id).value.trim();
            if (!TIME_MMSS_PATTERN.test(t)) { alert('Enter the time as MM:SS, e.g. 1:24.'); return; }
            if (!issue) { alert('Enter an issue description.'); return; }
            if (!stagedErrorEntries[id]) stagedErrorEntries[id] = [];
            stagedErrorEntries[id].push({ time: t, error: issue, fix: f });
            // Keep staged entries sorted ascending by time as they're added, so the ledger preview
            // (and the eventual Drive submission) always reads chronologically.
            stagedErrorEntries[id].sort(function(a, b) {
                var toSec = function(x) { var p = x.split(':'); return (parseInt(p[0],10)*60) + parseInt(p[1],10); };
                return toSec(a.time) - toSec(b.time);
            });
            var l = document.getElementById('ledger-' + id); l.style.display = 'flex'; l.innerHTML = '';
            stagedErrorEntries[id].forEach(function(e) {
                var n = document.createElement('div'); n.className = 'staged-error-item';
                n.innerText = e.time + ' — ' + e.error + (e.fix ? ' → ' + e.fix : '');
                l.appendChild(n);
            });
            document.getElementById(id).setAttribute('data-errors', 'YES');
            document.getElementById('input-stamp-' + id).value = '';
            document.getElementById('input-issue-' + id).value = '';
            document.getElementById('input-fix-' + id).value = '';
        }

        async function dispatchStagedErrorsViaGitHub(id, name) {
            var entries = stagedErrorEntries[id] || [];
            if (entries.length === 0) {
                var t = document.getElementById('input-stamp-' + id).value.trim();
                var issue = document.getElementById('input-issue-' + id).value.trim();
                if (t && issue) { stageLocalErrorEntry(id, name); entries = stagedErrorEntries[id] || []; }
                if (entries.length === 0) { alert('Add at least one timestamped entry first.'); return; }
            }
            var reportId = Date.now() + '-' + Math.random().toString(36).slice(2,7);
            var payload = { songName: name, entries: entries, submittedBy: _spotifyUserEmail || 'unknown', submittedAt: new Date().toISOString() };
            try {
                var resp = await fetch(WORKER_URL + '/github/push', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: 'error-reports/' + reportId + '.json', content: toBase64(JSON.stringify(payload, null, 2)), message: 'Error report: ' + name })
                });
                var result = await resp.json();
                if (result && result.success !== false) {
                    stagedErrorEntries[id] = [];
                    var ledger = document.getElementById('ledger-' + id);
                    if (ledger) { ledger.innerHTML = ''; ledger.style.display = 'none'; }
                    toggleErrorSubmissionForm(id);
                    alert('Sent!');
                } else { alert('Failed to send error report. Please try again.'); }
            } catch(e) { alert('Error: ' + e); }
        }

        // ── INIT ──
        var storedShelf = localStorage.getItem('dashboard_shelf_mode');
        shelfModeActive = storedShelf === null ? true : storedShelf === '1';
        document.getElementById('shelfToggleBtn').innerText = '📁 Album Shelf: ' + (shelfModeActive ? 'ON' : 'OFF');
        renderArtistPanel();
        // Restore panel from URL hash on load (supports refreshing a deep-linked panel)
        var initHash = window.location.hash.replace('#','');
        if (initHash === 'songs' || initHash === 'album' || initHash === 'detail') {
            _activatePanel(initHash === 'detail' ? 'artist' : initHash, null);
        } else {
            _activatePanel('artist', null);
        }
        document.getElementById('btn-all').classList.add('active-filter');

        if ('serviceWorker' in navigator) {
            window.addEventListener('load', function() {
                navigator.serviceWorker.register('./sw.js').catch(function(err) {
                    console.warn('Service worker registration failed:', err);
                });
            });
        }

        // ── SPOTIFY PLAYER ──
        var SPOTIFY_CLIENT_ID = '';  // injected at runtime from dashboard data attr
        var SPOTIFY_TOKEN_WORKER = 'https://spotify-token-refresh.cloudfare-fb3.workers.dev/';
        var SPOTIFY_REDIRECT_URI = 'https://phelzier.github.io/dashboard';
        var SPOTIFY_SCOPES = 'streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state user-library-read playlist-read-private user-top-read user-read-recently-played';

        var _spotifyAccessToken = null;
        var _spotifyRefreshToken = null;
        var _spotifyTokenExpiry = 0;
        var _spotifyPlayer = null;       // SDK player (Premium, desktop)
        var _spotifyPlayerReady = false;
        var _spotifyDeviceId = null;
        var _spotifyMode = null;         // 'sdk' or 'api'
        var _spotifyPollTimer = null;
        var _spotifyCurrentUri = null;
        var _spotifyCurrentMs = 0;
        var _spotifyIsPlaying = false;
        var _spotifyDurationMs = 1;
        var _spotifyUserEmail = null;

        var SPOTIFY_ALLOWED_DOMAINS = ['psfamily.co.uk','psfamily.net','benandtish.co.uk','2themaxxx.co.uk','4themaxxx.co.uk'];

        async function verifySpotifyUser() {
            try {
                var resp = await spotifyApiCall('GET', '/me');
                if (!resp || !resp.email) return false;
                _spotifyUserEmail = resp.email;
                var domain = _spotifyUserEmail.split('@')[1] || '';
                return SPOTIFY_ALLOWED_DOMAINS.indexOf(domain) !== -1;
            } catch(e) { return false; }
        }

        // PKCE helpers
        function _pkceRandom(len) {
            var arr = new Uint8Array(len);
            crypto.getRandomValues(arr);
            return Array.from(arr, function(b) { return ('0' + b.toString(16)).slice(-2); }).join('').slice(0, len);
        }
        function _pkceBase64url(buf) {
            return btoa(String.fromCharCode.apply(null, new Uint8Array(buf)))
                .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        }
        async function _pkceChallenge(verifier) {
            var enc = new TextEncoder().encode(verifier);
            var digest = await crypto.subtle.digest('SHA-256', enc);
            return _pkceBase64url(digest);
        }

        function spotifyGetClientId() {
            // Client ID is stored in the dashboard's root element data attribute, written by PS1
            return (document.documentElement.getAttribute('data-spotify-client-id') || '').trim();
        }

        // ── SPOTIFY PANEL ──
        var _spView = 'playlists';
        var _spPlaylists = null;
        var _spPlaylistTracks = {};
        var WORKER_URL = 'https://spotify-token-refresh.cloudfare-fb3.workers.dev';

        // ── GITHUB HELPERS ──────────────────────────────────────────────────
        async function ghPush(path, base64Content, message) {
            var r = await fetch(WORKER_URL + '/github/push', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({path:path,content:base64Content,message:message||'Upload: '+path}) });
            return r.json();
        }
        async function ghDelete(path, sha, message) {
            var r = await fetch(WORKER_URL + '/github/delete', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({path:path,sha:sha,message:message||'Remove: '+path}) });
            return r.json();
        }
        async function ghList(folderPath) {
            var r = await fetch(WORKER_URL + '/github/list?path=' + encodeURIComponent(folderPath));
            if (!r.ok) return [];
            return r.json();
        }
        async function ghGetFile(filePath) {
            var r = await fetch(WORKER_URL + '/github/file?path=' + encodeURIComponent(filePath));
            if (!r.ok) return null;
            return r.json();
        }
        function toBase64(str) { return btoa(unescape(encodeURIComponent(str))); }
        function fromBase64(b64) { return decodeURIComponent(escape(atob(b64.replace(/\n/g,'')))); }

        // ── PENDING ERRORS ────────────────────────────────────────────────────
        var _pendingErrors = [];
        var _pendingErrorsSha = null;
        var PENDING_ERRORS_PATH = 'pending-errors.json';

        async function loadPendingErrors() {
            try {
                var file = await ghGetFile(PENDING_ERRORS_PATH);
                if (file && file.content) { _pendingErrors = JSON.parse(fromBase64(file.content)); _pendingErrorsSha = file.sha; }
                else { _pendingErrors = []; _pendingErrorsSha = null; }
            } catch(e) { _pendingErrors = []; }
            updatePendingErrorsBadge();
        }
        async function savePendingErrors() {
            var result = await ghPush(PENDING_ERRORS_PATH, toBase64(JSON.stringify(_pendingErrors,null,2)), 'Update pending errors');
            if (result && result.sha) _pendingErrorsSha = result.sha;
            updatePendingErrorsBadge();
        }
        function updatePendingErrorsBadge() {
            var badge = document.getElementById('pendingErrorsBadge');
            var count = _pendingErrors.filter(function(e){return e.status==='pending';}).length;
            if (badge) { badge.textContent = count>0?count:''; badge.style.display = count>0?'inline-flex':'none'; }
        }

        async function quickFlagError() {
            if (!_spotifyCurrentUri) return;
            var libTrack = null;
            MLP.tracks.forEach(function(t){ if(t.spotifyUri===_spotifyCurrentUri) libTrack=t; });
            if (!libTrack) { alert('This track is not in the library.'); return; }
            var ts = msToMmss(_spotifyCurrentMs);
            if (_spotifyIsPlaying) {
                if (_spotifyMode==='sdk'&&_spotifyPlayer) _spotifyPlayer.pause();
                else spotifyApiCall('PUT','/me/player/pause');
                _spotifyIsPlaying=false;
                document.getElementById('playerPlayPauseBtn').textContent='▶';
            }
            _pendingErrors.push({ id: Date.now()+'-'+Math.random().toString(36).slice(2,7), trackTitle:libTrack.title, trackId:libTrack.id, isrc:libTrack.isrc, spotifyUri:_spotifyCurrentUri, timestamp:ts, flaggedBy:_spotifyUserEmail, flaggedAt:new Date().toISOString(), status:'pending', errorType:null, errorDesc:null, fix:null });
            await savePendingErrors();
            var dock=document.getElementById('playerDock'); var flash=document.createElement('div');
            flash.style.cssText='position:absolute;top:-32px;left:50%;transform:translateX(-50%);background:#1DB954;color:#fff;padding:4px 12px;border-radius:6px;font-size:0.78rem;font-weight:700;white-space:nowrap;';
            flash.textContent='Flagged at '+ts;
            if(dock){dock.style.position='relative';dock.appendChild(flash);setTimeout(function(){flash.remove();},2000);}
        }

        async function completePendingError(errorId) {
            var entry = _pendingErrors.find(function(e){return e.id===errorId;});
            if (!entry) return;
            var parts = entry.timestamp.split(':');
            var ms = (parseInt(parts[0],10)*60+parseInt(parts[1],10))*1000;
            if (_spotifyMode==='sdk'&&_spotifyPlayer) _spotifyPlayer.seek(ms);
            else { if(entry.spotifyUri&&entry.spotifyUri!==_spotifyCurrentUri){playerPlayUri(entry.spotifyUri);setTimeout(function(){spotifyApiCall('PUT','/me/player/seek?position_ms='+ms);},1500);} else spotifyApiCall('PUT','/me/player/seek?position_ms='+ms); }
            openCompleteErrorModal(entry);
        }

        function openCompleteErrorModal(entry) {
            var ex = document.getElementById('_completeErrorModal'); if(ex) ex.remove();
            var modal = document.createElement('div');
            modal.id = '_completeErrorModal';
            modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:2000;display:flex;align-items:center;justify-content:center;padding:16px;';
            var box = document.createElement('div');
            box.style.cssText = 'background:#fff;border-radius:12px;padding:20px;width:100%;max-width:400px;color:#1a202c;';
            box.innerHTML = '<h3 style="margin:0 0 4px;font-size:1rem;">Complete Error Report</h3>' +
                '<div style="font-size:0.78rem;color:#718096;margin-bottom:14px;">' + escHtml(entry.trackTitle) + ' &bull; ' + escHtml(entry.timestamp) + '</div>' +
                '<label style="display:block;font-size:0.8rem;font-weight:600;color:#4a5568;margin-bottom:4px;">Issue type</label>' +
                '<select id="_ceType" style="width:100%;border:1px solid #e2e8f0;border-radius:6px;padding:8px;font-size:0.85rem;margin-bottom:10px;">' +
                '<option value="">-- choose --</option><option value="vocal">Vocal issue</option><option value="lyrics">Lyrics issue</option><option value="wrongfile">Wrong audio file</option><option value="glitch">Audio glitch</option></select>' +
                '<div id="_ceFields"></div>' +
                '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;">' +
                '<button id="_ceCancelBtn" style="border:none;border-radius:6px;padding:8px 16px;font-size:0.82rem;font-weight:700;cursor:pointer;background:#edf2f7;color:#4a5568;">Cancel</button>' +
                '<button id="_ceSubmitBtn" style="border:none;border-radius:6px;padding:8px 16px;font-size:0.82rem;font-weight:700;cursor:pointer;background:#4c51bf;color:#fff;">Submit</button>' +
                '</div>';
            modal.appendChild(box);
            document.body.appendChild(modal);
            box.querySelector('#_ceType').addEventListener('change', onCompleteErrorTypeChange);
            box.querySelector('#_ceCancelBtn').addEventListener('click', function() { modal.remove(); });
            box.querySelector('#_ceSubmitBtn').addEventListener('click', function() { submitCompleteError(entry.id); });
        }
        function onCompleteErrorTypeChange() {
            var type=document.getElementById('_ceType').value, fields=document.getElementById('_ceFields'); if(!fields) return;
            var h='';
            if(type==='vocal') h='<label style="display:block;font-size:0.8rem;font-weight:600;color:#4a5568;margin-bottom:4px;">Spoken word heard</label><input id="_ceF1" style="width:100%;border:1px solid #e2e8f0;border-radius:6px;padding:8px;font-size:0.85rem;margin-bottom:8px;"><label style="display:block;font-size:0.8rem;font-weight:600;color:#4a5568;margin-bottom:4px;">What it should be</label><input id="_ceF2" style="width:100%;border:1px solid #e2e8f0;border-radius:6px;padding:8px;font-size:0.85rem;">';
            else if(type==='lyrics') h='<label style="display:block;font-size:0.8rem;font-weight:600;color:#4a5568;margin-bottom:4px;">Text displayed</label><input id="_ceF1" style="width:100%;border:1px solid #e2e8f0;border-radius:6px;padding:8px;font-size:0.85rem;margin-bottom:8px;"><label style="display:block;font-size:0.8rem;font-weight:600;color:#4a5568;margin-bottom:4px;">Correct lyric</label><input id="_ceF2" style="width:100%;border:1px solid #e2e8f0;border-radius:6px;padding:8px;font-size:0.85rem;">';
            else if(type==='wrongfile'||type==='glitch') h='<label style="display:block;font-size:0.8rem;font-weight:600;color:#4a5568;margin-bottom:4px;">Description</label><textarea id="_ceF1" style="width:100%;border:1px solid #e2e8f0;border-radius:6px;padding:8px;font-size:0.85rem;min-height:60px;resize:vertical;"></textarea>';
            fields.innerHTML=h;
        }
        async function submitCompleteError(errorId) {
            var type=(document.getElementById('_ceType')||{}).value; if(!type){alert('Choose an issue type.');return;}
            var f1=(document.getElementById('_ceF1')||{}).value||'', f2=(document.getElementById('_ceF2')||{}).value||'';
            var errText='',fixText='';
            if(type==='vocal'){errText='Vocal: heard "'+f1+'"';fixText='Should be: "'+f2+'"';}
            else if(type==='lyrics'){errText='Lyrics displayed: "'+f1+'"';fixText='Correct: "'+f2+'"';}
            else if(type==='wrongfile'){errText='Wrong file: '+f1;}
            else if(type==='glitch'){errText='Glitch: '+f1;}
            var entry=_pendingErrors.find(function(e){return e.id===errorId;}); if(!entry) return;
            var report={songName:entry.trackTitle,entries:[{time:entry.timestamp,error:errText,fix:fixText}],submittedBy:_spotifyUserEmail,submittedAt:new Date().toISOString(),flaggedBy:entry.flaggedBy};
            var result=await ghPush('error-reports/'+entry.id+'.json',toBase64(JSON.stringify(report,null,2)),'Error report: '+entry.trackTitle);
            if(result&&result.success!==false){
                _pendingErrors=_pendingErrors.filter(function(e){return e.id!==errorId;});
                await savePendingErrors();
                document.getElementById('_completeErrorModal').remove();
                updatePendingErrorsBadge();
            } else { alert('Failed to submit. Please try again.'); }
        }

        // ── THUMBS UP ─────────────────────────────────────────────────────────
        async function thumbsUpCurrentTrack() {
            if(!_spotifyCurrentUri) return;
            var libTrack=null; MLP.tracks.forEach(function(t){if(t.spotifyUri===_spotifyCurrentUri)libTrack=t;});
            if(!libTrack) return;
            var path='analytics/'+libTrack.title.replace(/[^a-zA-Z0-9]/g,'_')+'-confidence.json';
            var file=await ghGetFile(path); var entries=[]; var sha=null;
            if(file&&file.content){try{entries=JSON.parse(fromBase64(file.content));}catch(e){} sha=file.sha;}
            entries.push({at:new Date().toISOString(),by:_spotifyUserEmail,pos:msToMmss(_spotifyCurrentMs)});
            _confidenceScores[libTrack.id]=(entries.length);
            updateConfidenceBadges();
            await ghPush(path,toBase64(JSON.stringify(entries,null,2)),'Thumbs up: '+libTrack.title);
            var btn=document.getElementById('playerThumbsBtn');
            if(btn){var orig=btn.innerHTML;btn.innerHTML='✓';btn.style.color='#1DB954';setTimeout(function(){btn.innerHTML=orig;btn.style.color='';},1500);}
        }

        // ── CONFIDENCE SCORES ─────────────────────────────────────────────────
        var _confidenceScores = {};
        // Effective confidence = thumbs-up count minus confirmed error penalty (-1 per error line).
        function computeEffectiveConfidence(trackId, track) {
            var thumbs = _confidenceScores[trackId] || 0;
            if (!track || track.errors !== 'Yes' || !track.errorText) return thumbs;
            var errorLines = track.errorText.split('\n').filter(function(l) { return l.trim() && l.indexOf(';') !== -1; });
            return thumbs - errorLines.length; // -1 per confirmed error; all types set to -1 for now
        }
        async function loadConfidenceScores() {
            try {
                var files=await ghList('analytics');
                if(!Array.isArray(files)) return;
                for(var i=0;i<files.length;i++){
                    var f=files[i]; if(!f.name.endsWith('-confidence.json')) continue;
                    var file=await ghGetFile('analytics/'+f.name); if(!file||!file.content) continue;
                    try{
                        var entries=JSON.parse(fromBase64(file.content));
                        var stem=f.name.replace(/-confidence\.json$/,'');
                        MLP.tracks.forEach(function(t){if(t.title.replace(/[^a-zA-Z0-9]/g,'_')===stem) _confidenceScores[t.id]=entries.length;});
                    }catch(e){}
                }
                updateConfidenceBadges();
            } catch(e){}
        }
        function updateConfidenceBadges() {
            MLP.tracks.forEach(function(t) {
                var badge = document.getElementById('conf-badge-' + t.id);
                if (!badge) return;
                var thumbs = _confidenceScores[t.id] || 0;
                var errCount = 0;
                if (t.errors === 'Yes' && t.errorText) {
                    errCount = t.errorText.split('\n').filter(function(l){ return l.trim() && l.indexOf(';') !== -1; }).length;
                }
                var eff = thumbs - errCount;
                if (thumbs > 0 || errCount > 0) {
                    var label = '\uD83D\uDC4D ' + thumbs;
                    if (errCount > 0) label += ' \u26A0\uFE0F\u2212' + errCount + ' = ' + eff;
                    badge.textContent = label;
                    badge.style.display = 'inline';
                    badge.style.color = eff < 0 ? '#e53e3e' : '#1DB954';
                } else {
                    badge.style.display = 'none';
                }
            });
        }

        function showSpotifyPendingErrors() {
            showPanel('spotify');
            _spView='pending';
            document.querySelectorAll('.spotify-tab-btn').forEach(function(b){b.classList.remove('active');});
            var btn=document.getElementById('sp-btn-pending'); if(btn) btn.classList.add('active');
            var el=document.getElementById('spotifyPanelContent'); if(el) renderPendingErrorsList(el);
        }

        function buildValidateErrorsSection(cardId) {
            var track = _trackMap[cardId];
            if (!track || track.errors !== 'Yes' || !track.errorText) return;
            var detailContent = document.getElementById('detail-content');
            if (!detailContent) return;
            if (document.getElementById('validateErrorsSection-' + cardId)) return;
            var lines = track.errorText.split('\n').filter(function(l) { return l.trim(); });
            if (!lines.length) return;
            var section = document.createElement('div');
            section.id = 'validateErrorsSection-' + cardId;
            section.style.cssText = 'background:#fff5f5;border:1px solid #feb2b2;border-radius:10px;padding:14px;margin-top:12px;';
            section.innerHTML = '<div style="font-weight:800;font-size:0.9rem;color:#c53030;margin-bottom:10px;">&#x26A0; Validate Errors (' + lines.length + ')</div>';
            lines.forEach(function(line, idx) {
                var parts = line.split(';');
                var ts   = (parts[0] || '').trim();
                var desc = (parts[1] || '').trim();
                var fix  = (parts[2] || '').trim();
                var entry = document.createElement('div');
                entry.style.cssText = 'border:1px solid #fed7d7;border-radius:6px;padding:10px;margin-bottom:8px;background:#fff;';
                entry.innerHTML =
                    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">' +
                      '<span style="background:#e53e3e;color:#fff;border-radius:4px;padding:2px 7px;font-size:0.75rem;font-weight:700;">' + escHtml(ts) + '</span>' +
                      '<span style="font-weight:600;font-size:0.85rem;flex:1;">' + escHtml(desc) + '</span>' +
                    '</div>' +
                    (fix ? '<div style="font-size:0.78rem;color:#718096;margin-bottom:8px;"><strong>Fix:</strong> ' + escHtml(fix) + '</div>' : '') +
                    '<div style="display:flex;gap:8px;">' +
                      '<button data-ts="' + escHtml(ts) + '" data-uri="' + escHtml(track.spotifyUri||'') + '" style="background:#1DB954;color:#fff;border:none;border-radius:5px;padding:5px 10px;font-size:0.75rem;font-weight:700;cursor:pointer;">&#x25B6; Play from here</button>' +
                      '<button data-status="pending" style="background:#edf2f7;color:#4a5568;border:none;border-radius:5px;padding:5px 10px;font-size:0.75rem;font-weight:700;cursor:pointer;">Awaiting review</button>' +
                    '</div>';
                entry.querySelector('[data-ts]').addEventListener('click', function() {
                    var tp = this.dataset.ts.split(':');
                    var ms = (parseInt(tp[0],10)*60 + parseInt(tp[1],10)) * 1000;
                    if (this.dataset.uri && this.dataset.uri !== _spotifyCurrentUri) {
                        playerPlayUri(this.dataset.uri).then(function() { setTimeout(function() {
                            if (_spotifyMode === 'sdk' && _spotifyPlayer) _spotifyPlayer.seek(ms);
                            else spotifyApiCall('PUT', '/me/player/seek?position_ms=' + ms);
                        }, 1500); });
                    } else {
                        if (_spotifyMode === 'sdk' && _spotifyPlayer) _spotifyPlayer.seek(ms);
                        else spotifyApiCall('PUT', '/me/player/seek?position_ms=' + ms);
                    }
                });
                var sb = entry.querySelector('[data-status]');
                sb.addEventListener('click', function() {
                    var cur = this.dataset.status;
                    var nxt = cur === 'pending' ? 'confirmed' : (cur === 'confirmed' ? 'dismissed' : 'pending');
                    this.dataset.status = nxt;
                    if (nxt === 'confirmed') { this.style.background = '#c6f6d5'; this.style.color = '#276749'; this.textContent = '\u2713 Confirmed'; }
                    else if (nxt === 'dismissed') { this.style.background = '#e2e8f0'; this.style.color = '#718096'; this.textContent = '\u2715 Dismissed'; }
                    else { this.style.background = '#edf2f7'; this.style.color = '#4a5568'; this.textContent = 'Awaiting review'; }
                });
                section.appendChild(entry);
            });
            detailContent.appendChild(section);
        }

        // ── SPOTIFY VIEW RENDERERS ────────────────────────────────────────────
        // Returns ordered list of visible card spotifyUris from the current DOM state
        function getVisibleQueueUris() {
            var cards = document.getElementById('cardsContainer').children;
            var uris = [];
            for (var i = 0; i < cards.length; i++) {
                var c = cards[i];
                if (c.style.display === 'none') continue;
                var uri = c.getAttribute('data-spotify-uri');
                if (uri) uris.push(uri);
            }
            return uris;
        }

        async function playerPlayUriInContext(uri) {
            // Play uri but queue all other visible tracks after it
            var allUris = getVisibleQueueUris();
            var idx = allUris.indexOf(uri);
            if (idx === -1) { await playerPlayUri(uri); return; }
            // Reorder: start at idx
            var ordered = allUris.slice(idx).concat(allUris.slice(0, idx));
            try {
                if (_spotifyMode === 'sdk' && _spotifyDeviceId) {
                    await spotifyApiCall('PUT', '/me/player/play', { uris: ordered, device_id: _spotifyDeviceId });
                } else {
                    await spotifyApiCall('PUT', '/me/player/play', { uris: ordered });
                }
                _spotifyCurrentUri = uri;
                showPlayerDock();
                startApiPoller();
            } catch(e) { await playerPlayUri(uri); }
        }

        async function playerPlayAlbum(albumUri, startTrackUri) {
            // Play an album context_uri, optionally offset to a specific track
            var body = { context_uri: albumUri };
            if (startTrackUri) body.offset = { uri: startTrackUri };
            if (_spotifyDeviceId) body.device_id = _spotifyDeviceId;
            await spotifyApiCall('PUT', '/me/player/play', body);
            showPlayerDock();
            startApiPoller();
        }

        function renderSpotifyTrackRow(track, contextUris, ctxLabel) {
            // track: Spotify track object; contextUris: array of uris to queue; ctxLabel: string
            var uri = track.uri;
            var name = track.name || '—';
            var artists = (track.artists||[]).map(function(a){return a.name;}).join(', ');
            var album = track.album ? track.album.name : '';
            var img = track.album && track.album.images && track.album.images[0] ? track.album.images[0].url : '';
            var row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);cursor:pointer;';
            row.innerHTML =
                (img ? '<img src="'+img+'" style="width:40px;height:40px;border-radius:4px;flex-shrink:0;" />' : '<div style="width:40px;height:40px;border-radius:4px;background:var(--bg-card);flex-shrink:0;"></div>') +
                '<div style="flex:1;min-width:0;"><div style="font-weight:600;font-size:0.85rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+escHtml(name)+'</div>' +
                '<div style="font-size:0.75rem;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+escHtml(artists)+(album?' · '+escHtml(album):'')+'</div></div>' +
                '<button style="background:#1DB954;color:#fff;border:none;border-radius:5px;padding:5px 10px;font-size:0.75rem;font-weight:700;cursor:pointer;">▶</button>';
            row.querySelector('button').addEventListener('click', function(e) {
                e.stopPropagation();
                if (contextUris && contextUris.length > 1) {
                    var idx = contextUris.indexOf(uri);
                    var ordered = idx >= 0 ? contextUris.slice(idx).concat(contextUris.slice(0, idx)) : contextUris;
                    (function() {
                        var body = { uris: ordered };
                        if (_spotifyDeviceId) body.device_id = _spotifyDeviceId;
                        spotifyApiCall('PUT', '/me/player/play', body).then(function() { _spotifyCurrentUri = uri; showPlayerDock(); startSpotifyPoll(); });
                    })();
                } else {
                    playerPlayUri(uri);
                }
            });
            return row;
        }

        async function renderSpotifyPlaylists(el) {
            if (!_spPlaylists) {
                var data = await spotifyApiCall('GET', '/me/playlists?limit=50');
                _spPlaylists = data ? (data.items || []) : [];
            }
            if (!_spPlaylists.length) { el.innerHTML = '<div style="color:var(--text-muted);padding:12px;">No playlists found.</div>'; return; }
            var html = '<div style="display:flex;flex-direction:column;gap:6px;">';
            _spPlaylists.forEach(function(pl) {
                var img = pl.images && pl.images[0] ? pl.images[0].url : '';
                html += '<div class="sp-pl-row" data-uri="'+escHtml(pl.uri)+'" data-id="'+escHtml(pl.id)+'" style="display:flex;align-items:center;gap:10px;padding:8px;border-radius:8px;background:var(--bg-card);cursor:pointer;">' +
                    (img ? '<img src="'+img+'" style="width:44px;height:44px;border-radius:4px;flex-shrink:0;" />' : '<div style="width:44px;height:44px;border-radius:4px;background:var(--bg-section);flex-shrink:0;"></div>') +
                    '<div style="flex:1;min-width:0;"><div style="font-weight:600;font-size:0.85rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+escHtml(pl.name)+'</div>' +
                    '<div style="font-size:0.75rem;color:var(--text-muted);">'+((pl.tracks&&pl.tracks.total)||0)+' tracks</div></div>' +
                    '<button class="sp-pl-play-btn" data-uri="'+escHtml(pl.uri)+'" style="background:#1DB954;color:#fff;border:none;border-radius:5px;padding:5px 10px;font-size:0.75rem;font-weight:700;cursor:pointer;">▶</button>' +
                    '<span style="font-size:0.75rem;color:var(--text-muted);">&#9654; Open</span></div>';
            });
            html += '</div>';
            el.innerHTML = html;
            el.querySelectorAll('.sp-pl-play-btn').forEach(function(btn) {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var uri = this.dataset.uri;
                    playerPlayAlbum(uri, null);
                });
            });
            el.querySelectorAll('.sp-pl-row').forEach(function(row) {
                row.addEventListener('click', async function(e) {
                    if (e.target.tagName === 'BUTTON') return;
                    var id = this.dataset.id;
                    if (!_spPlaylistTracks[id]) {
                        var td = await spotifyApiCall('GET', '/playlists/'+id+'/tracks?limit=50&fields=items(track(uri,name,artists,album))');
                        _spPlaylistTracks[id] = td ? (td.items||[]).map(function(i){return i.track;}).filter(Boolean) : [];
                    }
                    var tracks = _spPlaylistTracks[id];
                    var uris = tracks.map(function(t){return t.uri;});
                    var subEl = document.createElement('div');
                    subEl.style.cssText = 'padding:8px 0 0 54px;';
                    tracks.forEach(function(t) { subEl.appendChild(renderSpotifyTrackRow(t, uris, 'playlist')); });
                    var existing = this.nextSibling;
                    if (existing && existing.classList && existing.classList.contains('sp-pl-tracks')) {
                        existing.remove();
                    } else {
                        subEl.className = 'sp-pl-tracks';
                        this.parentNode.insertBefore(subEl, this.nextSibling);
                    }
                });
            });
        }

        async function renderSpotifyLiked(el) {
            var data = await spotifyApiCall('GET', '/me/tracks?limit=50');
            var items = data ? (data.items || []) : [];
            if (!items.length) { el.innerHTML = '<div style="color:var(--text-muted);padding:12px;">No liked songs.</div>'; return; }
            var tracks = items.map(function(i){return i.track;}).filter(Boolean);
            var uris = tracks.map(function(t){return t.uri;});
            var div = document.createElement('div');
            tracks.forEach(function(t) { div.appendChild(renderSpotifyTrackRow(t, uris, 'liked')); });
            el.innerHTML = ''; el.appendChild(div);
        }

        async function renderSpotifyRecent(el) {
            var data = await spotifyApiCall('GET', '/me/player/recently-played?limit=50');
            var items = data ? (data.items || []) : [];
            if (!items.length) { el.innerHTML = '<div style="color:var(--text-muted);padding:12px;">No recent tracks.</div>'; return; }
            var tracks = items.map(function(i){return i.track;}).filter(Boolean);
            var uris = tracks.map(function(t){return t.uri;});
            var div = document.createElement('div');
            tracks.forEach(function(t) { div.appendChild(renderSpotifyTrackRow(t, uris, 'recent')); });
            el.innerHTML = ''; el.appendChild(div);
        }

        async function renderSpotifyTop(el) {
            var data = await spotifyApiCall('GET', '/me/top/tracks?limit=50&time_range=medium_term');
            var tracks = data ? (data.items || []) : [];
            if (!tracks.length) { el.innerHTML = '<div style="color:var(--text-muted);padding:12px;">No top tracks found.</div>'; return; }
            var uris = tracks.map(function(t){return t.uri;});
            var div = document.createElement('div');
            tracks.forEach(function(t) { div.appendChild(renderSpotifyTrackRow(t, uris, 'top')); });
            el.innerHTML = ''; el.appendChild(div);
        }

        function switchSpotifyView(view) {
            _spView = view;
            document.querySelectorAll('.spotify-tab-btn').forEach(function(b) { b.classList.remove('active'); });
            var btn = document.getElementById('sp-btn-' + view);
            if (btn) btn.classList.add('active');
            loadSpotifyPanel();
        }

        async function loadSpotifyPanel() {
            var el = document.getElementById('spotifyPanelContent');
            if (!el || !_spotifyAccessToken) return;
            el.innerHTML = '<div style="color:var(--text-muted);font-size:0.85rem;padding:20px 0;">Loading...</div>';
            try {
                if (_spView === 'playlists') await renderSpotifyPlaylists(el);
                else if (_spView === 'liked')  await renderSpotifyLiked(el);
                else if (_spView === 'recent') await renderSpotifyRecent(el);
                else if (_spView === 'top')    await renderSpotifyTop(el);
            } catch(e) {
                el.innerHTML = '<div style="color:#e53e3e;padding:12px;">Failed to load: ' + e + '</div>';
            }
        }

        async function spotifyAuth() {
            var clientId = spotifyGetClientId();
            if (!clientId) { alert('Spotify client ID not configured in dashboard.'); return; }
            var verifier = _pkceRandom(64);
            var challenge = await _pkceChallenge(verifier);
            sessionStorage.setItem('pkce_verifier', verifier);
            var params = new URLSearchParams({
                client_id: clientId, response_type: 'code',
                redirect_uri: SPOTIFY_REDIRECT_URI, scope: SPOTIFY_SCOPES,
                code_challenge_method: 'S256', code_challenge: challenge
            });
            window.location = 'https://accounts.spotify.com/authorize?' + params.toString();
        }

        async function spotifyExchangeCode(code) {
            var clientId = spotifyGetClientId();
            var verifier = sessionStorage.getItem('pkce_verifier');
            var resp = await fetch(SPOTIFY_TOKEN_WORKER, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ grant_type: 'authorization_code', code: code,
                    redirect_uri: SPOTIFY_REDIRECT_URI, code_verifier: verifier, client_id: clientId })
            });
            var data = await resp.json();
            if (data.access_token) {
                _spotifyAccessToken = data.access_token;
                _spotifyRefreshToken = data.refresh_token;
                _spotifyTokenExpiry = Date.now() + (data.expires_in * 1000) - 60000;
                sessionStorage.setItem('sp_refresh', _spotifyRefreshToken);
                sessionStorage.removeItem('pkce_verifier');
                var url = new URL(window.location);
                url.searchParams.delete('code');
                history.replaceState({}, '', url);
                verifySpotifyUser().then(function(allowed) {
                    if (allowed) { hideAuthScreen(); spotifyInit(); }
                    else { _spotifyAccessToken = null; sessionStorage.removeItem('sp_refresh'); showAuthScreen('Access denied. Your Spotify account (' + _spotifyUserEmail + ') is not authorised.'); }
                });
            }
        }

        async function spotifyRefreshAccessToken() {
            var rt = _spotifyRefreshToken || sessionStorage.getItem('sp_refresh');
            if (!rt) return false;
            var clientId = spotifyGetClientId();
            var resp = await fetch(SPOTIFY_TOKEN_WORKER, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: rt, client_id: clientId })
            });
            var data = await resp.json();
            if (data.access_token) {
                _spotifyAccessToken = data.access_token;
                _spotifyTokenExpiry = Date.now() + (data.expires_in * 1000) - 60000;
                if (data.refresh_token) { _spotifyRefreshToken = data.refresh_token; sessionStorage.setItem('sp_refresh', data.refresh_token); }
                return true;
            }
            return false;
        }

        async function spotifyApiCall(method, path, body) {
            if (Date.now() > _spotifyTokenExpiry) { var ok = await spotifyRefreshAccessToken(); if (!ok) return null; }
            var opts = { method: method, headers: { Authorization: 'Bearer ' + _spotifyAccessToken } };
            if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
            var resp = await fetch('https://api.spotify.com/v1' + path, opts);
            if (resp.status === 204 || resp.status === 202) return {};
            if (!resp.ok) return null;
            try { return await resp.json(); } catch(e) { return {}; }
        }

        // Called by Spotify SDK when ready
        window.onSpotifyWebPlaybackSDKReady = function() {
            var clientId = spotifyGetClientId();
            if (!clientId || !_spotifyAccessToken) return;
            _spotifyPlayer = new Spotify.Player({
                name: 'Music Library Dashboard',
                getOAuthToken: function(cb) { cb(_spotifyAccessToken); },
                volume: 0.8
            });
            _spotifyPlayer.addListener('ready', function(e) {
                _spotifyDeviceId = e.device_id;
                _spotifyPlayerReady = true;
                _spotifyMode = 'sdk';
                showPlayerDock();
            });
            _spotifyPlayer.addListener('not_ready', function() { _spotifyPlayerReady = false; });
            _spotifyPlayer.addListener('initialization_error', function() { spotifyFallbackToApi(); });
            _spotifyPlayer.addListener('authentication_error', function() { spotifyFallbackToApi(); });
            _spotifyPlayer.addListener('account_error', function() { spotifyFallbackToApi(); });
            _spotifyPlayer.addListener('player_state_changed', function(state) {
                if (!state) return;
                _spotifyIsPlaying = !state.paused;
                _spotifyCurrentMs = state.position;
                _spotifyDurationMs = state.duration || 1;
                var track = state.track_window && state.track_window.current_track;
                if (track) {
                    _spotifyCurrentUri = track.uri;
                    updatePlayerUI(track.name, track.artists.map(function(a){return a.name;}).join(', '));
                }
            });
            _spotifyPlayer.connect().then(function(ok) {
                if (!ok) spotifyFallbackToApi();
            });
        };

        function spotifyFallbackToApi() {
            _spotifyMode = 'api';
            showPlayerDock();
            startSpotifyPoll();
        }

        function startSpotifyPoll() {
            if (_spotifyPollTimer) return;
            _spotifyPollTimer = setInterval(async function() {
                var data = await spotifyApiCall('GET', '/me/player');
                if (!data || !data.item) return;
                _spotifyIsPlaying = data.is_playing;
                _spotifyCurrentMs = data.progress_ms || 0;
                _spotifyDurationMs = data.item.duration_ms || 1;
                _spotifyCurrentUri = data.item.uri;
                updatePlayerUI(data.item.name, data.item.artists.map(function(a){return a.name;}).join(', '));
            }, 2000);
        }

        function showPlayerDock() {
            document.getElementById('playerDock').classList.add('visible');
            document.body.style.paddingBottom = '70px';
            // Show Spotify tab
            var spTab = document.getElementById('tab-spotify');
            if (spTab) spTab.style.display = '';
            loadPendingErrors();
            loadConfidenceScores();
        }

        function updatePlayerUI(name, artist) {
            document.getElementById('playerTrackName').textContent = name || '—';
            document.getElementById('playerTrackArtist').textContent = artist || '—';
            document.getElementById('playerPlayPauseBtn').textContent = _spotifyIsPlaying ? '⏸' : '▶';
            var pct = _spotifyDurationMs > 0 ? (_spotifyCurrentMs / _spotifyDurationMs * 100) : 0;
            document.getElementById('playerProgressFill').style.width = pct + '%';
            document.getElementById('playerTime').textContent = msToMmss(_spotifyCurrentMs);
        }

        function msToMmss(ms) {
            var s = Math.floor((ms || 0) / 1000);
            return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
        }

        async function playerTogglePlay() {
            if (_spotifyMode === 'sdk' && _spotifyPlayer) {
                _spotifyPlayer.togglePlay();
            } else {
                if (_spotifyIsPlaying) {
                    await spotifyApiCall('PUT', '/me/player/pause');
                } else {
                    await spotifyApiCall('PUT', '/me/player/play');
                }
                _spotifyIsPlaying = !_spotifyIsPlaying;
                document.getElementById('playerPlayPauseBtn').textContent = _spotifyIsPlaying ? '⏸' : '▶';
            }
        }

        async function playerSeek(event) {
            var bar = event.currentTarget;
            var pct = event.offsetX / bar.offsetWidth;
            var ms = Math.floor(pct * _spotifyDurationMs);
            if (_spotifyMode === 'sdk' && _spotifyPlayer) {
                _spotifyPlayer.seek(ms);
            } else {
                await spotifyApiCall('PUT', '/me/player/seek?position_ms=' + ms);
            }
            _spotifyCurrentMs = ms;
            document.getElementById('playerProgressFill').style.width = (pct * 100) + '%';
            document.getElementById('playerTime').textContent = msToMmss(ms);
        }

        async function playerPlayUri(uri) {
            if (!_spotifyAccessToken) { spotifyAuth(); return; }
            if (_spotifyMode === 'sdk' && _spotifyDeviceId) {
                await spotifyApiCall('PUT', '/me/player/play', { uris: [uri], device_id: _spotifyDeviceId });
            } else {
                await spotifyApiCall('PUT', '/me/player/play', { uris: [uri] });
            }
        }

        // Report modal
        function openReportModal() {
            if (_spotifyIsPlaying) {
                if (_spotifyMode === 'sdk' && _spotifyPlayer) _spotifyPlayer.pause();
                else spotifyApiCall('PUT', '/me/player/pause');
                _spotifyIsPlaying = false;
                document.getElementById('playerPlayPauseBtn').textContent = '▶';
            }
            document.getElementById('reportTrackName').value = document.getElementById('playerTrackName').textContent;
            document.getElementById('reportTimestamp').value = msToMmss(_spotifyCurrentMs);
            document.getElementById('reportIssueType').value = '';
            onReportTypeChange();
            document.getElementById('reportModalBackdrop').classList.add('open');
        }

        function closeReportModal() {
            document.getElementById('reportModalBackdrop').classList.remove('open');
            // Resume playback
            if (!_spotifyIsPlaying) {
                if (_spotifyMode === 'sdk' && _spotifyPlayer) _spotifyPlayer.resume();
                else spotifyApiCall('PUT', '/me/player/play');
                _spotifyIsPlaying = true;
                document.getElementById('playerPlayPauseBtn').textContent = '⏸';
            }
        }

        function onReportTypeChange() {
            var type = document.getElementById('reportIssueType').value;
            ['vocal','lyrics','wrongfile','glitch'].forEach(function(t) {
                document.getElementById('reportFields' + t.charAt(0).toUpperCase() + t.slice(1)).style.display = (type === t) ? 'block' : 'none';
            });
        }

        function submitReportModal() {
            var track = document.getElementById('reportTrackName').value.trim();
            var ts    = document.getElementById('reportTimestamp').value.trim();
            var type  = document.getElementById('reportIssueType').value;
            if (!type) { alert('Choose an issue type.'); return; }

            var errorText = '', fixText = '';
            if (type === 'vocal') {
                errorText = 'Vocal: heard "' + document.getElementById('reportVocalHeard').value.trim() + '"';
                fixText   = 'Should be: "' + document.getElementById('reportVocalShouldBe').value.trim() + '"';
            } else if (type === 'lyrics') {
                errorText = 'Lyrics displayed: "' + document.getElementById('reportLyricsDisplayed').value.trim() + '"';
                fixText   = 'Correct: "' + document.getElementById('reportLyricsCorrect').value.trim() + '"';
            } else if (type === 'wrongfile') {
                errorText = 'Wrong file: ' + document.getElementById('reportWrongfileDesc').value.trim();
            } else if (type === 'glitch') {
                errorText = 'Glitch: ' + document.getElementById('reportGlitchDesc').value.trim();
            }

            var entries = [{ time: ts, error: errorText, fix: fixText }];
            var reportId = Date.now() + '-' + Math.random().toString(36).slice(2,7);
            var payload = { songName: track, entries: entries, submittedBy: _spotifyUserEmail || 'unknown', submittedAt: new Date().toISOString() };
            fetch(WORKER_URL + '/github/push', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({path:'error-reports/'+reportId+'.json', content:toBase64(JSON.stringify(payload,null,2)), message:'Error report: '+track}) })
                .then(function(r){return r.json();})
                .then(function(result){ if(result&&result.success!==false){closeReportModal();}else{alert('Failed to submit report. Please try again.');} })
                .catch(function(){alert('Failed to submit report.');});
        }

        // On page load: check for OAuth callback code, or restore existing token, or auto-redirect to auth
        (function spotifyBoot() {
            var params = new URLSearchParams(window.location.search);
            var code = params.get('code');
            if (code) { spotifyExchangeCode(code); return; }
            var rt = sessionStorage.getItem('sp_refresh');
            if (rt) {
                _spotifyRefreshToken = rt;
                spotifyRefreshAccessToken().then(function(ok) {
                    if (ok) spotifyInit();
                    else { sessionStorage.removeItem('sp_refresh'); spotifyAuth(); }
                });
            } else {
                spotifyAuth(); // First visit — redirect to Spotify login immediately
            }
        })();

        function spotifyInit() {
            // Try SDK first; if onSpotifyWebPlaybackSDKReady fires and connects, we use SDK mode.
            // If SDK fails, spotifyFallbackToApi() is called automatically.
            // For API-only mode (fallback), start polling immediately.
            if (typeof Spotify === 'undefined') {
                // SDK script not loaded yet — poll loaded event or just use API
                spotifyFallbackToApi();
            }
            // SDK path handled by onSpotifyWebPlaybackSDKReady
        }