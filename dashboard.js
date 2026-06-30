        // ── GLOBAL STATE ──
        var activeStatusFilter = 'ALL';
        var activeSelectedHasAssets = [];
        var activeSelectedMissingAssets = [];
        var trackMemoryErrorLedgers = {};
        var shelfModeActive = true;
        var selectionModeActive = false;
        var selectedTrackIds = [];
        var activeSortKey = 'none';
        var BATCH_EMAIL_BODY_CHAR_LIMIT = 1800;
        var currentUploadModalTrackId = null;
        var currentLyricsTrackContext = null;
        var DRIVE_UPLOAD_FORM_URL = "https://script.google.com/macros/s/AKfycbyDUHTdym61L6ztjTgdO2E4ImWFDcKh6vFspTUIPe2Fz7qTLPcWt79rTPPHZNF17_c/exec";

        // ── PANEL NAVIGATION ──
        var currentPanel = 'artist';
        var panelHistory = [];

        function showPanel(name, ctx) {
            document.querySelectorAll('.panel').forEach(function(p) { p.classList.remove('active'); });
            document.querySelectorAll('.nav-tab').forEach(function(t) { t.classList.remove('active'); });
            var el = document.getElementById('panel-' + name);
            if (el) el.classList.add('active');
            var tab = document.getElementById('tab-' + name);
            if (tab) tab.classList.add('active');
            currentPanel = name;
            if (name === 'album' && ctx) renderAlbumPanel(ctx);
            if (name === 'detail' && ctx) renderDetailPanel(ctx);
            if (name === 'songs') evaluateControlMatrix();
            window.scrollTo(0, 0);
        }

        // ── ARTIST PANEL ──
        function navigateToArtist() { showPanel('artist'); }

        function navigateToAlbumFromArtist(albumName) {
            showPanel('album', { albumName: albumName, fromArtist: true });
        }

        function renderArtistPanel() {
            // Artists rendered server-side; chip clicks wired here
            document.querySelectorAll('.artist-album-chip[data-album]').forEach(function(chip) {
                chip.onclick = function() { navigateToAlbumFromArtist(chip.getAttribute('data-album')); };
            });
            document.querySelectorAll('.artist-card[data-artist]').forEach(function(card) {
                // clicking the card body (not a chip) goes to songs filtered by artist
                card.onclick = function(e) {
                    if (e.target.closest('.artist-album-chip')) return;
                    showPanel('songs');
                    // filter by artist name via search
                    var artistName = card.getAttribute('data-artist');
                    document.getElementById('searchInput').value = artistName;
                    evaluateControlMatrix();
                };
            });
        }

        // ── ALBUM PANEL ──
        function renderAlbumPanel(ctx) {
            // albumName is the NAS album name; find matching cards
            var albumName = ctx.albumName || '';
            var artistName = ctx.artistName || '';
            var panel = document.getElementById('panel-album');

            // Breadcrumb
            var bc = panel.querySelector('.breadcrumb');
            if (bc) bc.innerHTML = '<a href="#" onclick="showPanel(\'artist\');return false;">Artists</a><span class="breadcrumb-sep">›</span><span>' + escHtml(albumName) + '</span>';

            // Get tracks for this album
            var cards = document.querySelectorAll('.card[data-album-group]');
            var albumCards = [];
            cards.forEach(function(c) {
                if ((c.getAttribute('data-album-group') || '').toLowerCase() === albumName.toLowerCase()) albumCards.push(c);
            });

            // Build hero — use album art from first confirmed card
            var heroArt = '';
            var heroTitle = albumName;
            var heroArtist = '';
            var heroType = '';
            var heroRelease = '';
            var heroTracks = albumCards.length;
            var heroSpotifyUrl = '';
            var heroGenres = '';
            var heroUPC = '';

            if (albumCards.length > 0) {
                var fc = albumCards[0];
                heroArt = fc.getAttribute('data-album-art') || '';
                heroArtist = fc.getAttribute('data-spotify-artist') || '';
                heroType = fc.getAttribute('data-album-type') || '';
                heroRelease = fc.getAttribute('data-release-date') || '';
                heroSpotifyUrl = fc.getAttribute('data-album-spotify-url') || '';
                heroGenres = fc.getAttribute('data-album-genres') || '';
                heroUPC = fc.getAttribute('data-album-upc') || '';
            }

            var artHtml = heroArt ? '<img class="album-hero-art" src="' + escHtml(heroArt) + '" alt="Album art">' :
                '<div class="album-hero-art" style="display:flex;align-items:center;justify-content:center;font-size:2rem;">💿</div>';

            var artistLink = heroArtist ? '<a href="#" onclick="showPanel(\'artist\');return false;">' + escHtml(heroArtist) + '</a>' : '';
            var spotifyChip = heroSpotifyUrl ? '<a href="' + escHtml(heroSpotifyUrl) + '" target="_blank" class="album-stat-chip green">Open on Spotify ↗</a>' : '';
            var genreChip = heroGenres ? '<span class="album-stat-chip">' + escHtml(heroGenres) + '</span>' : '';
            var upcChip = heroUPC ? '<span class="album-stat-chip">UPC: ' + escHtml(heroUPC) + '</span>' : '';

            var heroHtml = '<div class="album-hero">' +
                '<div class="album-hero-top">' + artHtml +
                '<div class="album-hero-info">' +
                (heroType ? '<div class="album-hero-type">' + escHtml(heroType) + '</div>' : '') +
                '<div class="album-hero-title">' + escHtml(heroTitle) + '</div>' +
                '<div class="album-hero-artist">' + artistLink + '</div>' +
                '<div class="album-hero-meta">' +
                (heroRelease ? '<span class="album-stat-chip">' + escHtml(heroRelease) + '</span>' : '') +
                '<span class="album-stat-chip">' + heroTracks + ' tracks</span>' +
                genreChip + upcChip + spotifyChip +
                '</div></div></div>' +
                '<div class="album-tracklist">';

            albumCards.sort(function(a, b) {
                return (parseInt(a.getAttribute('data-track-num')) || 999) - (parseInt(b.getAttribute('data-track-num')) || 999);
            });

            albumCards.forEach(function(c, idx) {
                var tName = c.getAttribute('data-title') || '';
                var status = (c.getAttribute('data-status') || '').toLowerCase();
                var dur = c.getAttribute('data-duration') || '';
                var domId = c.id;
                var pillCls = status === 'ready' ? 'ready' : (status === 'asset gathering' ? 'asset-gathering' : status.replace(' ','-'));
                heroHtml += '<div class="album-track-row" onclick="showPanel(\'detail\',{cardId:\'' + domId + '\'})">' +
                    '<span class="album-track-num">' + (idx + 1) + '</span>' +
                    '<span class="album-track-name">' + escHtml(tName) + '</span>' +
                    '<span class="album-track-status"><span class="status-pill ' + pillCls + '">' + escHtml(status) + '</span></span>' +
                    '<span class="album-track-dur">' + escHtml(dur) + '</span>' +
                    '</div>';
            });

            heroHtml += '</div></div>';
            var heroContainer = panel.querySelector('#album-hero-container');
            if (heroContainer) heroContainer.innerHTML = heroHtml;
        }

        // ── DETAIL PANEL ──
        var KEY_NAMES = ['C','C♯/D♭','D','D♯/E♭','E','F','F♯/G♭','G','G♯/A♭','A','A♯/B♭','B'];

        function renderDetailPanel(ctx) {
            var cardId = ctx.cardId;
            var card = document.getElementById(cardId);
            if (!card) return;
            var panel = document.getElementById('panel-detail');

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

            var hasAudioFeatures = tempo > 0;

            var html = '<div class="detail-hero">' +
                '<div class="detail-hero-top">' + artHtml +
                '<div class="detail-hero-info">' +
                '<div class="detail-hero-title">' + escHtml(title) + (explicit ? ' <span class="badge flagged">E</span>' : '') + '</div>' +
                '<div class="detail-hero-sub">' + artistLink + (albumName !== 'N/A' ? ' · ' + albumLink : '') + spotifyLink + '</div>' +
                '<div class="detail-chip-row">' +
                '<span class="status-pill ' + status.toLowerCase().replace(' ','-') + '">' + escHtml(status) + '</span>' +
                (dur ? '<span class="album-stat-chip">' + escHtml(dur) + '</span>' : '') +
                (isrc ? '<span class="album-stat-chip">' + escHtml(isrc) + '</span>' : '') +
                '</div></div></div></div>';

            // Popularity
            if (pop > 0) {
                html += '<div class="detail-section"><div class="detail-section-title">Spotify Popularity</div>' +
                    '<div class="popularity-bar-wrap">' +
                    '<div class="popularity-bar-track"><div class="popularity-bar-fill" style="width:' + pop + '%"></div></div>' +
                    '<div class="popularity-num">' + pop + '</div></div></div>';
            }

            // Audio features
            if (hasAudioFeatures) {
                var afRows = [
                    ['Energy',          energy,   true],
                    ['Danceability',    dance,    true],
                    ['Valence',         valence,  true],
                    ['Acousticness',    acoustic, true],
                    ['Instrumentalness',instru,   true],
                    ['Speechiness',     speech,   true],
                    ['Liveness',        live,     true],
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
                    }).join('') +
                    '</div></div>';
            }

            // Assets
            html += '<div class="detail-section"><div class="detail-section-title">Assets</div>' +
                '<div class="asset-dot-grid">' + assetDots + '</div></div>';

            // Financials
            var gbpEarnings = (parseFloat(earnings) * 0.79).toFixed(2);
            html += '<div class="detail-section"><div class="detail-section-title">Financials</div>' +
                '<div class="detail-kv-grid">' +
                '<div class="detail-kv"><div class="detail-kv-label">Total Earnings</div><div class="detail-kv-value">£' + gbpEarnings + '</div></div>' +
                '<div class="detail-kv"><div class="detail-kv-label">ISRC</div><div class="detail-kv-value">' + escHtml(isrc || '—') + '</div></div>' +
                '</div></div>';

            // Admin actions - preserved from card
            html += '<div class="detail-section"><div class="detail-section-title">Actions</div>' +
                '<div style="display:flex;flex-wrap:wrap;gap:8px;">' +
                '<button class="subform-btn btn-email" onclick="toggleUploadPicker(\'' + cardId + '\')">📤 Upload Asset</button>' +
                '<button class="subform-btn btn-email" onclick="dispatchVerificationMarkViaEmail(\'' + cardId + '\',\'' + escJs(title) + '\')">👍 Verify</button>' +
                '<button class="subform-btn btn-add" onclick="toggleErrorSubmissionForm(\'' + cardId + '\')">⚠️ Log Error</button>' +
                '<button class="subform-btn btn-add" onclick="togglePublicationForm(\'' + cardId + '\')">🌐 Publication</button>' +
                '<a href="' + escHtml(nasUrl) + '" class="subform-btn btn-add" target="_blank">📁 NAS</a>' +
                '</div></div>';

            // Error/pub subforms pulled from original card (still in DOM)
            var subform = document.getElementById('subform-' + cardId);
            var pubform = document.getElementById('pubform-' + cardId);
            if (subform) html += subform.outerHTML.replace('id="subform-', 'id="detail-subform-').replace('style="display:none"','');
            if (pubform) html += pubform.outerHTML.replace('id="pubform-', 'id="detail-pubform-').replace('style="display:none"','');

            var bc = panel.querySelector('.breadcrumb');
            if (bc) {
                var bcAlbum = albumName !== 'N/A'
                    ? '<a href="#" onclick="showPanel(\'album\',{albumName:\'' + escJs(albumName) + '\'});return false;">' + escHtml(albumName) + '</a><span class="breadcrumb-sep">›</span>'
                    : '';
                bc.innerHTML = '<a href="#" onclick="showPanel(\'artist\');return false;">Artists</a><span class="breadcrumb-sep">›</span>' + bcAlbum + '<span>' + escHtml(title) + '</span>';
            }
            var container = panel.querySelector('#detail-content');
            if (container) container.innerHTML = html;
        }

        function assetEmoji(a) {
            var m = {cover:'🖼️',clip:'✂️',canvas:'🎥',reel:'🎬',mp3:'🔊',wav:'💿',lyrics:'📄',url:'🔗',stems:'🎚️',daw:'💻',mastered:'🎛️',albumreel:'🎞️'};
            return m[a] || '•';
        }
        function escHtml(s) {
            return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
        }
        function escJs(s) { return String(s||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'"); }

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
        function dispatchBatchFeedbackViaEmail() {
            var inputs = document.querySelectorAll('.batch-issue-input');
            var sections = [];
            for (var i = 0; i < inputs.length; i++) {
                var issue = inputs[i].value.trim();
                if (issue) sections.push('== ' + inputs[i].getAttribute('data-track-name') + ' ==\nIssue: ' + issue);
            }
            if (sections.length === 0) { alert('Enter at least one issue before sending.'); return; }
            var body = '[ERROR REPORT BATCH]\n\n' + sections.join('\n\n') + '\n\nPlease append these to each track\'s Production\\errors.txt.';
            if (body.length > BATCH_EMAIL_BODY_CHAR_LIMIT) {
                var blob = new Blob([body], { type: 'text/plain' });
                var url = URL.createObjectURL(blob);
                var a = document.createElement('a'); a.href = url; a.download = 'batch_error_report.txt';
                document.body.appendChild(a); a.click(); document.body.removeChild(a);
                URL.revokeObjectURL(url);
                alert('Batch report saved as a text file. Please email it to phelzier1@gmail.com with subject "[ERROR REPORT BATCH]".');
            } else {
                window.location.href = 'mailto:phelzier1@gmail.com?subject=' + encodeURIComponent('[MLP] [ERROR REPORT BATCH] ' + sections.length + ' tracks') + '&body=' + encodeURIComponent(body);
            }
            closeBatchFeedbackForm(); clearAllSelections();
        }

        // ── STATUS / FILTER ──
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
            activeSortKey = 'none'; activeStatusFilter = 'ALL';
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

        function checkCardAgainstActiveMatrixRules(card, query, targetProfile, albumContextMode) {
            var status = (card.getAttribute('data-status') || '').toLowerCase().trim();
            var errors = (card.getAttribute('data-errors') || '').toLowerCase().trim();
            var profileAttr = card.getAttribute('data-profile') || 'N/A';
            var isAlbumDir = card.getAttribute('data-is-album') === 'TRUE';
            var missingArr = (card.getAttribute('data-missing') || '').toLowerCase().split(',').filter(Boolean);
            var existingArr = (card.getAttribute('data-existing') || '').toLowerCase().split(',').filter(Boolean);
            var cardText = card.textContent.toLowerCase();
            var matchStatus = activeStatusFilter === 'ALL' || (activeStatusFilter === 'ERRORS' && errors === 'yes') || (activeStatusFilter === 'MISSING' && status !== 'ready') || status === activeStatusFilter.toLowerCase().trim();
            var matchProfile = targetProfile === 'ALL' || (targetProfile === 'UNASSIGNED' && (profileAttr === 'N/A' || profileAttr === '')) || profileAttr === targetProfile;
            var matchAlbumCtx = albumContextMode === 'ALL' || (albumContextMode === 'ALBUM' && isAlbumDir) || (albumContextMode === 'LOOSE' && !isAlbumDir);
            var matchHas = activeSelectedHasAssets.every(function(a) { return existingArr.indexOf(a) > -1; });
            var matchMissing = activeSelectedMissingAssets.every(function(a) { return missingArr.indexOf(a) > -1; });
            var matchSearch = cardText.indexOf(query) > -1;
            return matchStatus && matchProfile && matchAlbumCtx && matchHas && matchMissing && matchSearch;
        }

        function evaluateControlMatrix() {
            var q = document.getElementById('searchInput').value.toLowerCase().trim();
            var prof = document.getElementById('profileSelect').value;
            var ctx = document.getElementById('albumContextSelect').value;
            var liveCards = document.getElementsByClassName('card');
            var cardsArr = Array.prototype.slice.call(liveCards);
            if (activeSortKey !== 'none') {
                var attr = 'data-earnings-' + activeSortKey.replace('earnings-','');
                cardsArr.sort(function(a,b) { return (parseFloat(b.getAttribute(attr))||0) - (parseFloat(a.getAttribute(attr))||0); });
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
                    h.innerHTML = '💿 <a href="#" onclick="showPanel(\'album\',{albumName:\'' + escJs(k) + '\'});return false;" style="color:inherit;text-decoration:none;">' + escHtml(k) + '</a> <span style="font-size:0.78rem;font-weight:500;color:var(--text-muted);">(' + map[k].length + ' Tracks)</span>';
                    sec.appendChild(h);
                    map[k].forEach(function(card) { card.style.display = 'flex'; sec.appendChild(card); });
                    gC.appendChild(sec);
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
            if (q) fL.push('<span>Search:</span> "' + q + '"');
            if (prof !== 'ALL') fL.push('<span>Account:</span> ' + prof);
            if (activeSelectedHasAssets.length) fL.push('<span>Has:</span> ' + activeSelectedHasAssets.join(', '));
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
            var collected = []; var map = {}; var tot = 0;
            for (var i = 0; i < cards.length; i++) {
                var c = cards[i];
                if (checkCardAgainstActiveMatrixRules(c, q, prof, ctx)) {
                    tot++; var t = c.getAttribute('data-title');
                    var g = c.getAttribute('data-album-group') || 'N/A';
                    if (!map[g]) map[g] = []; map[g].push(t);
                }
            }
            var payload = activeStatusFilter + ' Tracks\n\n';
            Object.keys(map).sort().forEach(function(k) { payload += '💿 ' + k + '\n' + map[k].map(function(t){ return '  - '+t;}).join('\n') + '\n\n'; });
            navigator.clipboard.writeText(payload.trim()).then(function(){ alert('Exported ' + tot + ' tracks.'); }).catch(function(){ alert('Clipboard failed.'); });
        }

        // ── UPLOAD / ADMIN / ERROR / PUBLICATION ── (all preserved)
        function toggleErrorSubmissionForm(id) { var p = document.getElementById('subform-' + id); if(p) p.style.display = (p.style.display === 'block') ? 'none' : 'block'; }
        function togglePublicationForm(id) { var p = document.getElementById('pubform-' + id); if(p) p.style.display = (p.style.display === 'block') ? 'none' : 'block'; }
        function toggleUploadPicker(id) {
            currentUploadModalTrackId = id;
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
                rowsHtml += '<div class="upload-modal-row"><span class="upload-modal-row-label">' + (iconMap[assetType]||'📤') + ' ' + assetType + '</span><button class="upload-modal-row-btn" onclick=\'openUploadRowAction("' + id + '","' + songName.replace(/"/g,'\\"').replace(/'/g,"\\'") + '","' + assetType + '","' + acceptAttr + '","' + expectedExt + '")\'>Upload</button></div>';
            });
            document.getElementById('uploadModalRows').innerHTML = rowsHtml || '<div class="upload-modal-empty">Nothing missing on this track. 🎉</div>';
            document.getElementById('lyricsEntryPanel').classList.remove('active');
            document.getElementById('uploadModalBackdrop').classList.add('active');
        }
        function closeUploadModal() {
            document.getElementById('uploadModalBackdrop').classList.remove('active');
            document.getElementById('lyricsEntryPanel').classList.remove('active');
            document.getElementById('lyricsTextarea').value = '';
            currentLyricsTrackContext = null;
        }
        var ADMIN_IMPORT_MAX_BYTES = 18 * 1024 * 1024;
        function toggleAdminPanel() { document.getElementById('adminModalBackdrop').classList.add('active'); }
        function closeAdminPanel() { document.getElementById('adminModalBackdrop').classList.remove('active'); }
        function triggerAdminImport(importType) {
            var input = document.createElement('input'); input.type = 'file'; input.accept = '.csv,.zip'; input.style.display = 'none';
            document.body.appendChild(input);
            input.addEventListener('change', function() {
                var file = input.files && input.files[0]; document.body.removeChild(input);
                if (!file) return;
                var fileExt = (file.name.split('.').pop() || '').toLowerCase();
                if (fileExt !== 'csv' && fileExt !== 'zip') { alert('Only .csv or .zip accepted.'); return; }
                if (file.size > ADMIN_IMPORT_MAX_BYTES) { alert('File too large (max 18MB).'); return; }
                var snapshotDate = null;
                if (importType === 'artist_songs_1day') {
                    snapshotDate = prompt('Which date does this snapshot cover? (YYYY-MM-DD)', new Date().toISOString().slice(0,10));
                    if (!snapshotDate || !/^\d{4}-\d{2}-\d{2}$/.test(snapshotDate.trim())) { if (snapshotDate !== null) alert('Invalid date. Import cancelled.'); return; }
                    snapshotDate = snapshotDate.trim();
                }
                var subject, body;
                if (importType === 'distrokid') { subject = '[MLP] [DISTROKID IMPORT] ' + file.name; body = 'Importing DistroKid export "' + file.name + '".\n\nIMPORTANT: attach the file then send.\n\nFigures will be appended and de-duplicated.'; }
                else if (importType === 'spotify_audience') { subject = '[MLP] [SPOTIFY AUDIENCE IMPORT] ' + file.name; body = 'Importing Spotify audience export "' + file.name + '".\n\nIMPORTANT: attach the file then send.'; }
                else if (importType === 'artist_songs_1day') { subject = '[MLP] [ARTIST SONGS 1DAY - ' + snapshotDate + '] ' + file.name; body = 'Importing artist songs 1-day snapshot for ' + snapshotDate + ': "' + file.name + '".\n\nIMPORTANT: attach the file then send.'; }
                else { subject = '[MLP] [SONG TIMELINE IMPORT] ' + file.name; body = 'Importing song timeline "' + file.name + '".\n\nIMPORTANT: attach the file then send.'; }
                window.location.href = 'mailto:phelzier1@gmail.com?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
                closeAdminPanel();
            }, { once: true });
            input.click();
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
            triggerAssetUpload(id, songName, assetType, acceptAttr, expectedExt);
        }
        function switchLyricsToFileUpload() { if (!currentLyricsTrackContext) return; var c = currentLyricsTrackContext; triggerAssetUpload(c.id, c.songName, 'Lyrics', c.acceptAttr, c.expectedExt); }
        function dispatchLyricsTextViaEmail() {
            if (!currentLyricsTrackContext) return;
            var text = document.getElementById('lyricsTextarea').value.trim();
            if (!text) { alert('Type or paste the lyrics first, or tap "Upload a .txt file instead".'); return; }
            var name = currentLyricsTrackContext.songName;
            window.location.href = 'mailto:phelzier1@gmail.com?subject=' + encodeURIComponent('[MLP] [ASSET UPLOAD TEXT] ' + name + ' - Lyrics') + '&body=' + encodeURIComponent('Lyrics for "' + name + '":\n\n' + text + '\n\nPlease save this as the lyrics for this track.');
            closeUploadModal();
        }
        function dispatchPublicationUpdateViaEmail(id, name) {
            var platform = document.getElementById('pub-platform-' + id).value.trim();
            var date = document.getElementById('pub-date-' + id).value.trim();
            var link = document.getElementById('pub-link-' + id).value.trim();
            if (!platform) { alert('Enter at least a platform name.'); return; }
            window.location.href = 'mailto:phelzier1@gmail.com?subject=' + encodeURIComponent('[MLP] [PUBLICATION UPDATE] ' + name) + '&body=' + encodeURIComponent('Publication update for "' + name + '":\n\nPlatform: ' + platform + (date ? '\nDate: ' + date : '') + (link ? '\nLink: ' + link : '') + '\n\nPlease update this track\'s publication status.');
            togglePublicationForm(id);
        }
        function dispatchVerificationMarkViaEmail(id, name) {
            var ts = new Date().toISOString();
            window.location.href = 'mailto:phelzier1@gmail.com?subject=' + encodeURIComponent('[MLP] [VERIFY] ' + name) + '&body=' + encodeURIComponent('Verification mark for "' + name + '":\n\nTimestamp: ' + ts + '\n\nPlease record this as a verification for this track.');
        }
        function triggerAssetUpload(id, name, assetType, acceptAttr, expectedExt) {
            window.open(DRIVE_UPLOAD_FORM_URL + '?song=' + encodeURIComponent(name) + '&type=' + encodeURIComponent(assetType), '_blank');
        }
        function stageLocalErrorEntry(id, name) {
            var s = document.getElementById('input-stamp-' + id).value.trim();
            var issue = document.getElementById('input-issue-' + id).value.trim();
            var f = document.getElementById('input-fix-' + id).value.trim();
            if (!issue) { alert('Enter an issue description.'); return; }
            if (!trackMemoryErrorLedgers[id]) trackMemoryErrorLedgers[id] = [];
            var entry = '[' + new Date().toLocaleString() + '] ' + (s ? 'Loc: ' + s + ' | ' : '') + 'Issue: ' + issue + (f ? ' -> Fix: ' + f : '');
            trackMemoryErrorLedgers[id].push(entry);
            var l = document.getElementById('ledger-' + id); l.style.display = 'flex';
            var n = document.createElement('div'); n.className = 'staged-error-item'; n.innerText = entry; l.appendChild(n);
            document.getElementById(id).setAttribute('data-errors', 'YES');
            var b = document.getElementById('logbox-' + id);
            if (b) { if (b.style.display === 'none') { b.style.display = 'block'; b.innerHTML = '<strong>Active Error Log Context:</strong><br>'; } b.innerHTML += '• ' + entry + '<br>'; }
            document.getElementById('input-stamp-' + id).value = '';
            document.getElementById('input-issue-' + id).value = '';
            document.getElementById('input-fix-' + id).value = '';
        }
        function dispatchStagedErrorsViaEmail(id, name) {
            var l = trackMemoryErrorLedgers[id] || [];
            if (l.length === 0) { stageLocalErrorEntry(id, name); l = trackMemoryErrorLedgers[id] || []; if (l.length === 0) return; }
            window.location.href = 'mailto:phelzier1@gmail.com?subject=' + encodeURIComponent('[MLP] [ERROR REPORT] Quality Control Suffix Notes: ' + name) + '&body=' + encodeURIComponent('Correction entries for "' + name + '":\n\n' + l.join('\n') + '\n\nPlease append to Production\\errors.txt.');
            trackMemoryErrorLedgers[id] = [];
            document.getElementById('ledger-' + id).innerHTML = '';
            document.getElementById('ledger-' + id).style.display = 'none';
            toggleErrorSubmissionForm(id);
        }

        // ── INIT ──
        var storedShelf = localStorage.getItem('dashboard_shelf_mode');
        shelfModeActive = storedShelf === null ? true : storedShelf === '1';
        document.getElementById('shelfToggleBtn').innerText = '📁 Album Shelf: ' + (shelfModeActive ? 'ON' : 'OFF');
        renderArtistPanel();
        showPanel('artist');
        document.getElementById('btn-all').classList.add('active-filter');

        if ('serviceWorker' in navigator) {
            window.addEventListener('load', function() {
                navigator.serviceWorker.register('./sw.js').catch(function(err) {
                    console.warn('Service worker registration failed:', err);
                });
            });
        }