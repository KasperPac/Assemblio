import { computed, watch, ref } from 'vue';


import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import dayOfYear from 'dayjs/plugin/dayOfYear';
import weekOfYear from 'dayjs/plugin/weekOfYear';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

import af from 'dayjs/locale/af.js';
import am from 'dayjs/locale/am.js';
import ardz from 'dayjs/locale/ar-dz.js';
import ariq from 'dayjs/locale/ar-iq.js';
import arkw from 'dayjs/locale/ar-kw.js';
import arly from 'dayjs/locale/ar-ly.js';
import arma from 'dayjs/locale/ar-ma.js';
import arsa from 'dayjs/locale/ar-sa.js';
import artn from 'dayjs/locale/ar-tn.js';
import ar from 'dayjs/locale/ar.js';
import az from 'dayjs/locale/az.js';
import be from 'dayjs/locale/be.js';
import bg from 'dayjs/locale/bg.js';
import bi from 'dayjs/locale/bi.js';
import bm from 'dayjs/locale/bm.js';
import bn from 'dayjs/locale/bn.js';
import bo from 'dayjs/locale/bo.js';
import br from 'dayjs/locale/br.js';
import bs from 'dayjs/locale/bs.js';
import ca from 'dayjs/locale/ca.js';
import cs from 'dayjs/locale/cs.js';
import cv from 'dayjs/locale/cv.js';
import cy from 'dayjs/locale/cy.js';
import da from 'dayjs/locale/da.js';
import deat from 'dayjs/locale/de-at.js';
import dech from 'dayjs/locale/de-ch.js';
import de from 'dayjs/locale/de.js';
import dv from 'dayjs/locale/dv.js';
import el from 'dayjs/locale/el.js';
import enau from 'dayjs/locale/en-au.js';
import enca from 'dayjs/locale/en-ca.js';
import engb from 'dayjs/locale/en-gb.js';
import enie from 'dayjs/locale/en-ie.js';
import enil from 'dayjs/locale/en-il.js';
import enin from 'dayjs/locale/en-in.js';
import ennz from 'dayjs/locale/en-nz.js';
import ensg from 'dayjs/locale/en-sg.js';
import entt from 'dayjs/locale/en-tt.js';
import en from 'dayjs/locale/en.js';
import eo from 'dayjs/locale/eo.js';
import esdo from 'dayjs/locale/es-do.js';
import esmx from 'dayjs/locale/es-mx.js';
import et from 'dayjs/locale/et.js';
import eu from 'dayjs/locale/eu.js';
import fa from 'dayjs/locale/fa.js';
import fi from 'dayjs/locale/fi.js';
import fo from 'dayjs/locale/fo.js';
import frca from 'dayjs/locale/fr-ca.js';
import frch from 'dayjs/locale/fr-ch.js';
import fr from 'dayjs/locale/fr.js';
import fy from 'dayjs/locale/fy.js';
import ga from 'dayjs/locale/ga.js';
import gd from 'dayjs/locale/gd.js';
import gl from 'dayjs/locale/gl.js';
import gomlatn from 'dayjs/locale/gom-latn.js';
import gu from 'dayjs/locale/gu.js';
import he from 'dayjs/locale/he.js';
import hi from 'dayjs/locale/hi.js';
import hr from 'dayjs/locale/hr.js';
import ht from 'dayjs/locale/ht.js';
import hu from 'dayjs/locale/hu.js';
import hyam from 'dayjs/locale/hy-am.js';
import id from 'dayjs/locale/id.js';
import is from 'dayjs/locale/is.js';
import itch from 'dayjs/locale/it-ch.js';
import it from 'dayjs/locale/it.js';
import ja from 'dayjs/locale/ja.js';
import jv from 'dayjs/locale/jv.js';
import ka from 'dayjs/locale/ka.js';
import kk from 'dayjs/locale/kk.js';
import km from 'dayjs/locale/km.js';
import kn from 'dayjs/locale/kn.js';
import ko from 'dayjs/locale/ko.js';
import ku from 'dayjs/locale/ku.js';
import ky from 'dayjs/locale/ky.js';
import lb from 'dayjs/locale/lb.js';
import lo from 'dayjs/locale/lo.js';
import lt from 'dayjs/locale/lt.js';
import lv from 'dayjs/locale/lv.js';
import me from 'dayjs/locale/me.js';
import mi from 'dayjs/locale/mi.js';
import mk from 'dayjs/locale/mk.js';
import ml from 'dayjs/locale/ml.js';
import mn from 'dayjs/locale/mn.js';
import mr from 'dayjs/locale/mr.js';
import msmy from 'dayjs/locale/ms-my.js';
import ms from 'dayjs/locale/ms.js';
import mt from 'dayjs/locale/mt.js';
import my from 'dayjs/locale/my.js';
import nb from 'dayjs/locale/nb.js';
import ne from 'dayjs/locale/ne.js';
import nlbe from 'dayjs/locale/nl-be.js';
import nl from 'dayjs/locale/nl.js';
import nn from 'dayjs/locale/nn.js';
import oclnc from 'dayjs/locale/oc-lnc.js';
import pain from 'dayjs/locale/pa-in.js';
import pl from 'dayjs/locale/pl.js';
import ptbr from 'dayjs/locale/pt-br.js';
import pt from 'dayjs/locale/pt.js';
import rn from 'dayjs/locale/rn.js';
import ro from 'dayjs/locale/ro.js';
import ru from 'dayjs/locale/ru.js';
import rw from 'dayjs/locale/rw.js';
import sd from 'dayjs/locale/sd.js';
import se from 'dayjs/locale/se.js';
import si from 'dayjs/locale/si.js';
import sk from 'dayjs/locale/sk.js';
import sl from 'dayjs/locale/sl.js';
import sq from 'dayjs/locale/sq.js';
import srcyrl from 'dayjs/locale/sr-cyrl.js';
import sr from 'dayjs/locale/sr.js';
import ss from 'dayjs/locale/ss.js';
import svfi from 'dayjs/locale/sv-fi.js';
import sv from 'dayjs/locale/sv.js';
import sw from 'dayjs/locale/sw.js';
import ta from 'dayjs/locale/ta.js';
import te from 'dayjs/locale/te.js';
import tet from 'dayjs/locale/tet.js';
import tg from 'dayjs/locale/tg.js';
import th from 'dayjs/locale/th.js';
import tk from 'dayjs/locale/tk.js';
import tlph from 'dayjs/locale/tl-ph.js';
import tlh from 'dayjs/locale/tlh.js';
import tr from 'dayjs/locale/tr.js';
import tzl from 'dayjs/locale/tzl.js';
import tzmlatn from 'dayjs/locale/tzm-latn.js';
import tzm from 'dayjs/locale/tzm.js';
import ugcn from 'dayjs/locale/ug-cn.js';
import uk from 'dayjs/locale/uk.js';
import ur from 'dayjs/locale/ur.js';
import uzlatn from 'dayjs/locale/uz-latn.js';
import uz from 'dayjs/locale/uz.js';
import vi from 'dayjs/locale/vi.js';
import xpseudo from 'dayjs/locale/x-pseudo.js';
import yo from 'dayjs/locale/yo.js';
import zhcn from 'dayjs/locale/zh-cn.js';
import zhhk from 'dayjs/locale/zh-hk.js';
import zhtw from 'dayjs/locale/zh-tw.js';
import zh from 'dayjs/locale/zh.js';
import espr from 'dayjs/locale/es-pr.js';
import esus from 'dayjs/locale/es-us.js';
import es from 'dayjs/locale/es.js';

const LOCALES = {
    af: af,
    am: am,
    'ar-dz': ardz,
    'ar-iq': ariq,
    'ar-kw': arkw,
    'ar-ly': arly,
    'ar-ma': arma,
    'ar-sa': arsa,
    'ar-tn': artn,
    ar: ar,
    az: az,
    be: be,
    bg: bg,
    bi: bi,
    bm: bm,
    bn: bn,
    bo: bo,
    br: br,
    bs: bs,
    ca: ca,
    cs: cs,
    cv: cv,
    cy: cy,
    da: da,
    'de-at': deat,
    'de-ch': dech,
    de: de,
    dv: dv,
    el: el,
    'en-au': enau,
    'en-ca': enca,
    'en-gb': engb,
    'en-ie': enie,
    'en-il': enil,
    'en-in': enin,
    'en-nz': ennz,
    'en-sg': ensg,
    'en-tt': entt,
    en: en,
    eo: eo,
    'es-do': esdo,
    'es-mx': esmx,
    et: et,
    eu: eu,
    fa: fa,
    fi: fi,
    fo: fo,
    'fr-ca': frca,
    'fr-ch': frch,
    fr: fr,
    fy: fy,
    ga: ga,
    gd: gd,
    gl: gl,
    'gom-latn': gomlatn,
    gu: gu,
    he: he,
    hi: hi,
    hr: hr,
    ht: ht,
    hu: hu,
    'hy-am': hyam,
    id: id,
    is: is,
    'it-ch': itch,
    it: it,
    ja: ja,
    jv: jv,
    ka: ka,
    kk: kk,
    km: km,
    kn: kn,
    ko: ko,
    ku: ku,
    ky: ky,
    lb: lb,
    lo: lo,
    lt: lt,
    lv: lv,
    me: me,
    mi: mi,
    mk: mk,
    ml: ml,
    mn: mn,
    mr: mr,
    'ms-my': msmy,
    ms: ms,
    mt: mt,
    my: my,
    nb: nb,
    ne: ne,
    'nl-be': nlbe,
    nl: nl,
    nn: nn,
    'oc-lnc': oclnc,
    'pa-in': pain,
    pl: pl,
    'pt-br': ptbr,
    pt: pt,
    rn: rn,
    ro: ro,
    ru: ru,
    rw: rw,
    sd: sd,
    se: se,
    si: si,
    sk: sk,
    sl: sl,
    sq: sq,
    'sr-cyrl': srcyrl,
    sr: sr,
    ss: ss,
    'sv-fi': svfi,
    sv: sv,
    sw: sw,
    ta: ta,
    te: te,
    tet: tet,
    tg: tg,
    th: th,
    tk: tk,
    'tl-ph': tlph,
    tlh: tlh,
    tr: tr,
    tzl: tzl,
    'tzm-latn': tzmlatn,
    tzm: tzm,
    'ug-cn': ugcn,
    uk: uk,
    ur: ur,
    'uz-latn': uzlatn,
    uz: uz,
    vi: vi,
    'x-pseudo': xpseudo,
    yo: yo,
    'zh-cn': zhcn,
    'zh-hk': zhhk,
    'zh-tw': zhtw,
    zh: zh,
    'es-pr': espr,
    'es-us': esus,
    es: es,
};
dayjs.extend(relativeTime);
dayjs.extend(dayOfYear);
dayjs.extend(weekOfYear);
dayjs.extend(customParseFormat);
dayjs.extend(utc);
dayjs.extend(timezone);

const oldGetDateIso = () => {
    const tzoffset = new Date().getTimezoneOffset() * 60000;
    const localISOTime = new Date(Date.now() - tzoffset).toISOString();
    return localISOTime;
};

const getDateIso = () => {
    return new Date().toISOString();
};

const _oldDateISO = ref(oldGetDateIso());
const _dateISO = ref(getDateIso());

setInterval(() => {
    _oldDateISO.value = oldGetDateIso();
    _dateISO.value = getDateIso();
}, 1000);

export default {
    /*=============================================m_ÔÔ_m=============================================\
        Plugin API
    \================================================================================================*/
    locales: LOCALES,
    lang: 'en',
    backupLang: 'en',

    async onLoad() {
        const lang = computed(() => wwLib.$store.getters['front/getLang']);

        watch(
            lang,
            lang => {
                this.lang = lang;
            },
            { immediate: true }
        );
    },
    /*=============================================m_ÔÔ_m=============================================\
        Dayjs
    \================================================================================================*/
    // deprecated
    dateISO() {
        return _oldDateISO.value;
    },
    date(...args) {
        return new Date(...args).toISOString();
    },
    dateRealtime() {
        return _dateISO.value;
    },
    toDateISO(date, inputFormat = this.settings.publicData.favoriteFormat) {
        if (!date) throw 'First parameter must be a string date';
        inputFormat = inputFormat && inputFormat.length ? inputFormat : 'YYYY-MM-DDTHH:mm:ss.sssZ';
        return dayjs(date, inputFormat, false).toISOString();
    },
    formatDate(date, format = this.settings.publicData.favoriteFormat, locale = this.lang) {
        if (!date) throw 'First parameter must be a string date';

        return dayjs(date)
            .locale(this.locales[locale] || this.backupLang)
            .format(format);
    },
    fromTime(date, withoutSuffix = false, locale = this.lang) {
        if (!date) throw 'First parameter must be a date as string';

        return dayjs()
            .locale(this.locales[locale] || this.backupLang)
            .from(dayjs(date), withoutSuffix);
    },
    toTime(date, withoutSuffix = false, locale = this.lang) {
        if (!date) throw 'First parameter must be a date as string';

        return dayjs()
            .locale(this.locales[locale] || this.backupLang)
            .to(dayjs(date), withoutSuffix);
    },
    compareDate(date1, date2, precision, float = false) {
        if (!date1) throw 'First parameter must be a date';
        if (!date2) throw 'Second parameter must be a date';
        if (!precision) throw 'Third parameter must be a string';

        return dayjs(date2).diff(dayjs(date1), precision, float);
    },
    getSecond(date = new Date().toISOString()) {
        return dayjs(date).get('second');
    },
    getMinute(date = new Date().toISOString()) {
        return dayjs(date).get('minute');
    },
    getHour(date = new Date().toISOString()) {
        return dayjs(date).get('hour');
    },
    getDay(date = new Date().toISOString()) {
        return dayjs(date).date();
    },
    getDayOfWeek(date = new Date().toISOString()) {
        return dayjs(date).get('day');
    },
    getMonth(date = new Date().toISOString()) {
        // Month (January as 0, December as 11) - https://day.js.org/docs/en/get-set/get
        return dayjs(date).get('month') + 1;
    },
    getYear(date = new Date().toISOString()) {
        return dayjs(date).get('year');
    },
    getDayOfYear(date = new Date().toISOString()) {
        return dayjs(date).dayOfYear();
    },
    getWeekOfYear(date = new Date().toISOString()) {
        return dayjs(date).week();
    },
    addSeconds(date, amount) {
        if (!date) throw 'First parameter must be a date';
        if (!amount && amount !== 0) throw 'Second parameter must be a number';

        return dayjs(date).add(amount, 'second').toISOString();
    },
    addMinutes(date, amount) {
        if (!date) throw 'First parameter must be a date';
        if (!amount && amount !== 0) throw 'Second parameter must be a number';

        return dayjs(date).add(amount, 'minute').toISOString();
    },
    addHours(date, amount) {
        if (!date) throw 'First parameter must be a date';
        if (!amount && amount !== 0) throw 'Second parameter must be a number';

        return dayjs(date).add(amount, 'hour').toISOString();
    },
    addDays(date, amount) {
        if (!date) throw 'First parameter must be a date';
        if (!amount && amount !== 0) throw 'Second parameter must be a number';

        return dayjs(date).add(amount, 'day').toISOString();
    },
    addMonths(date, amount) {
        if (!date) throw 'First parameter must be a date';
        if (!amount && amount !== 0) throw 'Second parameter must be a number';

        return dayjs(date).add(amount, 'month').toISOString();
    },
    addYears(date, amount) {
        if (!date) throw 'First parameter must be a date';
        if (!amount && amount !== 0) throw 'Second parameter must be a number';

        return dayjs(date).add(amount, 'year').toISOString();
    },
    setSecond(date, amount) {
        if (!date) throw 'First parameter must be a date';
        if (!amount && amount !== 0) throw 'Second parameter must be a number';

        return dayjs(date).set('second', amount).toISOString();
    },
    setMinute(date, amount) {
        if (!date) throw 'First parameter must be a date';
        if (!amount && amount !== 0) throw 'Second parameter must be a number';

        return dayjs(date).set('minute', amount).toISOString();
    },
    setHour(date, amount) {
        if (!date) throw 'First parameter must be a date';
        if (!amount && amount !== 0) throw 'Second parameter must be a number';

        return dayjs(date).set('hour', amount).toISOString();
    },
    setDay(date, amount) {
        if (!date) throw 'First parameter must be a date';
        if (!amount && amount !== 0) throw 'Second parameter must be a number';
        else if (amount === 0) return dayjs(date).toISOString();

        return dayjs(date).date(amount).toISOString();
    },
    setDayOfWeek(date, amount) {
        if (!date) throw 'First parameter must be a date';
        if (!amount && amount !== 0) throw 'Second parameter must be a number';
        else if (amount === 0) return dayjs(date).toISOString();

        return dayjs(date).set('day', amount).toISOString();
    },
    setMonth(date, amount) {
        if (!date) throw 'First parameter must be a date';
        if (!amount && amount !== 0) throw 'Second parameter must be a number';
        if (amount === 0) return dayjs(date).toISOString();

        // Month (January as 0, December as 11) - https://day.js.org/docs/en/get-set/set
        amount -= 1;
        return dayjs(date).set('month', amount).toISOString();
    },
    setYear(date, amount) {
        if (!date) throw 'First parameter must be a date';
        if (!amount && amount !== 0) throw 'Second parameter must be a number';

        return dayjs(date).set('year', amount).toISOString();
    },
    toTimestamp(date) {
        if (!date) throw 'First parameter must be a date';
        return dayjs(date).valueOf();
    },
    getBrowserTimezone() {
        return dayjs.tz.guess();
    },
    convertDateTimezone(date, timezone, preserve = false) {
        if (!date) throw 'First parameter must be a date';
        if (typeof timezone !== 'string') throw 'Second parameter must be a string';
        return dayjs(date).tz(timezone, preserve).format();
    },
    formatDateTimezone(
        date,
        format = this.settings.publicData.favoriteFormat,
        timezone = dayjs.tz.guess(),
        locale = this.lang
    ) {
        if (!date) throw 'First parameter must be a date';
        if (typeof format !== 'string') throw 'Second parameter must be a string';
        if (typeof timezone !== 'string') throw 'Third parameter must be a string';
        return dayjs(date)
            .tz(timezone)
            .locale(this.locales[locale] || this.backupLang)
            .format(format);
    },
};
