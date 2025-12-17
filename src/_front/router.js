import { createRouter, createWebHistory } from 'vue-router';

import wwPage from './views/wwPage.vue';

import { initializeData, initializePlugins, onPageUnload } from '@/_common/helpers/data';

let router;
const routes = [];

function scrollBehavior(to) {
    if (to.hash) {
        return {
            el: to.hash,
            behavior: 'smooth',
        };
    } else {
        return { top: 0 };
    }
}

 
/* wwFront:start */
import pluginsSettings from '../../plugins-settings.json';

// eslint-disable-next-line no-undef
window.wwg_designInfo = {"id":"6b33d938-836b-44f0-ae5b-d9d196cd0a91","homePageId":"19166363-6ed6-4b3c-9e1f-dbdf8069b246","authPluginId":"f5856798-485d-47be-b433-d43d771c64e1","baseTag":null,"defaultTheme":"light","langs":[{"lang":"en","default":true}],"background":{},"workflows":[],"pages":[{"id":"fb8f6f12-040a-45ad-8384-09f6db7e1e4b","linkId":"fb8f6f12-040a-45ad-8384-09f6db7e1e4b","name":"StocktakeDetails","folder":null,"paths":{"en":"stocktakedetails","default":"stocktakedetails"},"langs":["en"],"cmsDataSetPath":null,"sections":[{"uid":"e3b6f259-6a16-4235-acf5-40a49e150ebc","sectionTitle":"Sidebar Section","linkId":"579974dd-8b9f-465e-87d6-67a65899ba5d"},{"uid":"363affca-8c86-47f2-9bdc-0fcc2441c8bb","sectionTitle":"Toast Section","linkId":"cf50495f-5068-4229-bcf7-53703eb4cbca"},{"uid":"35d582f2-314b-4204-b76f-170daa400162","sectionTitle":"","linkId":"c621fb34-5c87-435c-ba69-c334c3c21699"}],"pageUserGroups":[{}],"title":{},"meta":{"desc":{},"keywords":{},"socialDesc":{},"socialTitle":{},"structuredData":{}},"metaImage":""},{"id":"d38ecee0-5b78-48a6-ac0a-a9ec7142fa5c","linkId":"d38ecee0-5b78-48a6-ac0a-a9ec7142fa5c","name":"PurchaseOrders","folder":null,"paths":{"en":"purchaseorders","default":"purchaseorders"},"langs":["en"],"cmsDataSetPath":null,"sections":[{"uid":"e3b6f259-6a16-4235-acf5-40a49e150ebc","sectionTitle":"Sidebar Section","linkId":"579974dd-8b9f-465e-87d6-67a65899ba5d"},{"uid":"363affca-8c86-47f2-9bdc-0fcc2441c8bb","sectionTitle":"Toast Section","linkId":"cf50495f-5068-4229-bcf7-53703eb4cbca"},{"uid":"d608047f-d904-4f0c-ba9d-ce9a6fed27f7","sectionTitle":"Purchase Order Main","linkId":"ad57d58a-78b2-4760-ac99-5814ca371558"}],"pageUserGroups":[{}],"title":{},"meta":{"desc":{},"keywords":{},"socialDesc":{},"socialTitle":{},"structuredData":{}},"metaImage":""},{"id":"e73c6635-435b-4c83-8de4-b4e095fe1af5","linkId":"e73c6635-435b-4c83-8de4-b4e095fe1af5","name":"Home","folder":null,"paths":{"en":"home","default":"home"},"langs":["en"],"cmsDataSetPath":null,"sections":[{"uid":"363affca-8c86-47f2-9bdc-0fcc2441c8bb","sectionTitle":"Toast Section","linkId":"cf50495f-5068-4229-bcf7-53703eb4cbca"},{"uid":"e3b6f259-6a16-4235-acf5-40a49e150ebc","sectionTitle":"Sidebar Section","linkId":"579974dd-8b9f-465e-87d6-67a65899ba5d"},{"uid":"c7a159a4-39b2-4e21-ab12-c85968cdacbc","sectionTitle":"Main Content Section","linkId":"c7cb0be2-9276-4c52-8624-63bce15a6661"},{"uid":"c6c1893a-c926-4da0-87d2-15f2defaae21","sectionTitle":"Login Section","linkId":"afff7251-1978-432e-afc1-d6dbd375e454"}],"pageUserGroups":[],"title":{"en":"","fr":"Vide | Commencer à partir de zéro"},"meta":{"desc":{},"keywords":{},"socialDesc":{},"socialTitle":{},"structuredData":{}},"metaImage":""},{"id":"02373be2-3c77-4cb2-9cf8-2f1aaacb539a","linkId":"02373be2-3c77-4cb2-9cf8-2f1aaacb539a","name":"Login","folder":"","paths":{"en":"login","default":"login"},"langs":["en"],"cmsDataSetPath":null,"sections":[{"uid":"8886988c-7198-4588-83dc-6be7635972df","sectionTitle":"Login Page Container","linkId":"13e01bc9-cee3-4a09-b7ca-60549809a029"},{"uid":"363affca-8c86-47f2-9bdc-0fcc2441c8bb","sectionTitle":"Toast Section","linkId":"cf50495f-5068-4229-bcf7-53703eb4cbca"}],"pageUserGroups":[],"title":{"en":"Login - Shopify Inventory & BOM Manager"},"meta":{"desc":{"en":"Login page for Shopify Inventory & BOM Manager SaaS app"},"keywords":{"en":"login, authentication, Shopify, inventory, BOM"},"socialDesc":{"en":"Access your Shopify Inventory & BOM Manager account"},"socialTitle":{"en":"Login to Shopify Inventory & BOM Manager"}},"metaImage":""},{"id":"8bb21fed-9d5c-4bad-afc0-acbf608ea61f","linkId":"8bb21fed-9d5c-4bad-afc0-acbf608ea61f","name":"ActivityLog","folder":"","paths":{"en":"activity-log","default":"activity-log"},"langs":["en"],"cmsDataSetPath":null,"sections":[{"uid":"e3b6f259-6a16-4235-acf5-40a49e150ebc","sectionTitle":"Sidebar Section","linkId":"579974dd-8b9f-465e-87d6-67a65899ba5d"},{"uid":"363affca-8c86-47f2-9bdc-0fcc2441c8bb","sectionTitle":"Toast Section","linkId":"cf50495f-5068-4229-bcf7-53703eb4cbca"},{"uid":"4e12fe00-12b7-45c2-bb4b-6130eeb4af59","sectionTitle":"Activity Log Main","linkId":"e3ee791e-f8ee-4e7c-9018-68b5c445f56a"}],"pageUserGroups":[{}],"title":{"en":"Activity Log - Shopify Inventory & BOM Manager"},"meta":{"desc":{"en":"Activity log with filters and detailed side panel"},"keywords":{"en":"activity log, audit, events"},"socialDesc":{"en":"View system activity and audit logs"},"socialTitle":{"en":"Activity Log"}},"metaImage":""},{"id":"d3df568e-275f-44ae-85b8-4edbb74dddcc","linkId":"d3df568e-275f-44ae-85b8-4edbb74dddcc","name":"Reports","folder":"","paths":{"en":"reports","default":"reports"},"langs":["en"],"cmsDataSetPath":null,"sections":[{"uid":"e3b6f259-6a16-4235-acf5-40a49e150ebc","sectionTitle":"Sidebar Section","linkId":"579974dd-8b9f-465e-87d6-67a65899ba5d"},{"uid":"5a46d2a1-5fc5-4b4a-a701-8194fd2c969f","sectionTitle":"Reports Main","linkId":"b9f04ab5-d91e-43d4-90b1-3fd37d99faec"}],"pageUserGroups":[{}],"title":{"en":"Reports - Shopify Inventory & BOM Manager"},"meta":{"desc":{"en":"Reports page with report cards and inline report views"},"keywords":{"en":"reports, inventory, stocktake, orders"},"socialDesc":{"en":"View and export inventory and order reports"},"socialTitle":{"en":"Reports"}},"metaImage":""},{"id":"2f56f1f2-febd-41e9-ae97-7342469d3d60","linkId":"2f56f1f2-febd-41e9-ae97-7342469d3d60","name":"Settings","folder":"","paths":{"en":"settings","default":"settings"},"langs":["en"],"cmsDataSetPath":null,"sections":[{"uid":"e3b6f259-6a16-4235-acf5-40a49e150ebc","sectionTitle":"Sidebar Section","linkId":"579974dd-8b9f-465e-87d6-67a65899ba5d"},{"uid":"363affca-8c86-47f2-9bdc-0fcc2441c8bb","sectionTitle":"Toast Section","linkId":"cf50495f-5068-4229-bcf7-53703eb4cbca"},{"uid":"b89d997d-421a-4a6b-9344-be8f9d5e800c","sectionTitle":"Settings Main Section","linkId":"deb6b6ff-f648-4e31-8718-ccf51b028c20"}],"pageUserGroups":[{}],"title":{"en":"Settings - Shopify Inventory & BOM Manager"},"meta":{"desc":{"en":"Settings page with tabs for integrations, locations, users, and general"},"keywords":{"en":"settings, integrations, locations, users, general"},"socialDesc":{"en":"Configure integrations, locations, users, and general tenant settings"},"socialTitle":{"en":"Settings"}},"metaImage":""},{"id":"19166363-6ed6-4b3c-9e1f-dbdf8069b246","linkId":"19166363-6ed6-4b3c-9e1f-dbdf8069b246","name":"Dashboard","folder":"","paths":{"en":"dashboard","default":"dashboard"},"langs":["en"],"cmsDataSetPath":null,"sections":[{"uid":"e3b6f259-6a16-4235-acf5-40a49e150ebc","sectionTitle":"Sidebar Section","linkId":"579974dd-8b9f-465e-87d6-67a65899ba5d"},{"uid":"363affca-8c86-47f2-9bdc-0fcc2441c8bb","sectionTitle":"Toast Section","linkId":"cf50495f-5068-4229-bcf7-53703eb4cbca"},{"uid":"1157f6bf-73a6-40ff-9a46-c861c377ff85","sectionTitle":"Dashboard Main","linkId":"7c46beeb-7c04-44c9-9188-d9a572f92972"}],"pageUserGroups":[{}],"title":{"en":"Dashboard - Shopify Inventory & BOM Manager"},"meta":{"desc":{"en":"Dashboard overview with metrics, recent orders, alerts, and quick links"},"keywords":{"en":"dashboard, metrics, orders, alerts, Shopify, inventory, BOM"},"socialDesc":{"en":"Quick overview of components, products, orders, and alerts"},"socialTitle":{"en":"Dashboard Overview"}},"metaImage":""},{"id":"72c89b97-b343-416f-94ac-37d53b5a15b7","linkId":"72c89b97-b343-416f-94ac-37d53b5a15b7","name":"TenantSelect","folder":null,"paths":{"en":"tenantselect","default":"tenantselect"},"langs":["en"],"cmsDataSetPath":null,"sections":[{"uid":"2cfd6b62-de32-4ebb-8faa-281f9aa56a7a","sectionTitle":"Tenant Selection Main","linkId":"0d7c5a7d-0c47-4671-abae-a87d4ddf1311"}],"pageUserGroups":[{}],"title":{},"meta":{"desc":{},"keywords":{},"socialDesc":{},"socialTitle":{},"structuredData":{}},"metaImage":""},{"id":"a71171e2-898f-4f40-b617-f5acae26ca6b","linkId":"a71171e2-898f-4f40-b617-f5acae26ca6b","name":"StocktakeSessionPrint","folder":null,"paths":{"en":"stocktakesessionprint","default":"stocktakesessionprint"},"langs":["en"],"cmsDataSetPath":null,"sections":[{"uid":"ce9d3669-abe2-4c47-94aa-e80b8757e5cb","sectionTitle":"","linkId":"8fe7c442-4ca6-464d-b788-f32c7a07d87c"}],"pageUserGroups":[{}],"title":{},"meta":{"desc":{},"keywords":{},"socialDesc":{},"socialTitle":{},"structuredData":{}},"metaImage":""},{"id":"dffdc71a-b329-4a2a-b0c4-5b30e7907edc","linkId":"dffdc71a-b329-4a2a-b0c4-5b30e7907edc","name":"Products","folder":"","paths":{"en":"products","default":"products"},"langs":["en"],"cmsDataSetPath":null,"sections":[{"uid":"e3b6f259-6a16-4235-acf5-40a49e150ebc","sectionTitle":"Sidebar Section","linkId":"579974dd-8b9f-465e-87d6-67a65899ba5d"},{"uid":"363affca-8c86-47f2-9bdc-0fcc2441c8bb","sectionTitle":"Toast Section","linkId":"cf50495f-5068-4229-bcf7-53703eb4cbca"},{"uid":"ff08e804-d0bb-41e5-a378-3efbe094694d","sectionTitle":"Main Content","linkId":"ba56029d-f830-49ef-b426-8257a2814402"}],"pageUserGroups":[{}],"title":{"en":"Products - Shopify Inventory & BOM Manager"},"meta":{"desc":{"en":"Products list with BOM status and search/filter capabilities"},"keywords":{"en":"products, BOM, Shopify, inventory"},"socialDesc":{"en":"Manage products and their BOMs"},"socialTitle":{"en":"Products List"}},"metaImage":""},{"id":"fb9fbf33-57b2-4f28-bd73-96a090426b27","linkId":"fb9fbf33-57b2-4f28-bd73-96a090426b27","name":"Components","folder":"","paths":{"en":"components","default":"components"},"langs":["en"],"cmsDataSetPath":null,"sections":[{"uid":"e3b6f259-6a16-4235-acf5-40a49e150ebc","sectionTitle":"Sidebar Section","linkId":"579974dd-8b9f-465e-87d6-67a65899ba5d"},{"uid":"363affca-8c86-47f2-9bdc-0fcc2441c8bb","sectionTitle":"Toast Section","linkId":"cf50495f-5068-4229-bcf7-53703eb4cbca"},{"uid":"f5fc5f51-4dc4-4bd9-873d-84829ab7655c","sectionTitle":"Main Content","linkId":"13d1e23e-6cbc-42e5-817a-5d3e13122fdf"}],"pageUserGroups":[{}],"title":{"en":"Components - Shopify Inventory & BOM Manager"},"meta":{"desc":{"en":"Component SKU catalogue with inventory balances and filters"},"keywords":{"en":"components, inventory, SKU, stock"},"socialDesc":{"en":"Manage components and inventory balances"},"socialTitle":{"en":"Components Catalogue"}},"metaImage":""},{"id":"3f0f7585-5631-44b7-bcc5-2b6cc0b59803","linkId":"3f0f7585-5631-44b7-bcc5-2b6cc0b59803","name":"ProductDetail","folder":"","paths":{"en":"products/{productId}","default":"products/{productId}"},"langs":["en"],"cmsDataSetPath":null,"sections":[{"uid":"e3b6f259-6a16-4235-acf5-40a49e150ebc","sectionTitle":"Sidebar Section","linkId":"579974dd-8b9f-465e-87d6-67a65899ba5d"},{"uid":"81284b96-e94a-47c6-9b6a-9fa115138182","sectionTitle":"Main Content","linkId":"fe80d397-986b-4c71-a323-a3c31a9e1aaf"},{"uid":"363affca-8c86-47f2-9bdc-0fcc2441c8bb","sectionTitle":"Toast Section","linkId":"cf50495f-5068-4229-bcf7-53703eb4cbca"}],"pageUserGroups":[{}],"title":{"en":"Product Detail & BOM - Shopify Inventory & BOM Manager"},"meta":{"desc":{"en":"Detailed product info and BOM builder with add/edit components"},"keywords":{"en":"product detail, BOM builder, components, Shopify"},"socialDesc":{"en":"View and edit BOM for selected product/variant"},"socialTitle":{"en":"Product Detail & BOM"}},"metaImage":""},{"id":"a4b45a61-a61b-454b-9531-4fca1bebc94f","linkId":"a4b45a61-a61b-454b-9531-4fca1bebc94f","name":"ComponentDetail","folder":"","paths":{"en":"components/{componentId}","default":"components/{componentId}"},"langs":["en"],"cmsDataSetPath":null,"sections":[{"uid":"e3b6f259-6a16-4235-acf5-40a49e150ebc","sectionTitle":"Sidebar Section","linkId":"579974dd-8b9f-465e-87d6-67a65899ba5d"},{"uid":"fe08025a-3ed2-4fc7-8717-15b10c4d9de1","sectionTitle":"Main Container","linkId":"5763e8a7-9899-4f57-92a7-7b38efd3d4c2"}],"pageUserGroups":[{}],"title":{"en":"Component Detail - Shopify Inventory & BOM Manager"},"meta":{"desc":{"en":"Component detail with info, inventory overview, movements, BOM usage"},"keywords":{"en":"component detail, inventory movements, BOM usage"},"socialDesc":{"en":"View and edit component details, stock movements, and BOM usage"},"socialTitle":{"en":"Component Detail"}},"metaImage":""},{"id":"efbf1945-adbb-4946-a33e-d772a2f165d0","linkId":"efbf1945-adbb-4946-a33e-d772a2f165d0","name":"OrderDetail","folder":"","paths":{"en":"orders/{orderId}","default":"orders/{orderId}"},"langs":["en"],"cmsDataSetPath":null,"sections":[{"uid":"e3b6f259-6a16-4235-acf5-40a49e150ebc","sectionTitle":"Sidebar Section","linkId":"579974dd-8b9f-465e-87d6-67a65899ba5d"},{"uid":"ef360b98-3808-4e42-a24a-b10db20ecb3d","sectionTitle":"Main Content","linkId":"cbcd0443-c011-4d7c-93df-c71b4bf6ab2d"},{"uid":"363affca-8c86-47f2-9bdc-0fcc2441c8bb","sectionTitle":"Toast Section","linkId":"cf50495f-5068-4229-bcf7-53703eb4cbca"}],"pageUserGroups":[{}],"title":{"en":"Order Detail - Shopify Inventory & BOM Manager"},"meta":{"desc":{"en":"Detailed order view with line items and component breakdown"},"keywords":{"en":"order detail, line items, component allocation"},"socialDesc":{"en":"View order lines and component requirements"},"socialTitle":{"en":"Order Detail"}},"metaImage":""},{"id":"5871840f-dc5c-4363-952e-9b670a87bae7","linkId":"5871840f-dc5c-4363-952e-9b670a87bae7","name":"StocktakeSessions","folder":"","paths":{"en":"stocktake","default":"stocktake"},"langs":["en"],"cmsDataSetPath":null,"sections":[{"uid":"e3b6f259-6a16-4235-acf5-40a49e150ebc","sectionTitle":"Sidebar Section","linkId":"579974dd-8b9f-465e-87d6-67a65899ba5d"},{"uid":"020d3df3-6c4b-40d8-bd1e-fe6a48624693","sectionTitle":"Stocktake Main Section","linkId":"62f9f64c-3358-4b8e-b957-8aa58634ff8e"},{"uid":"363affca-8c86-47f2-9bdc-0fcc2441c8bb","sectionTitle":"Toast Section","linkId":"cf50495f-5068-4229-bcf7-53703eb4cbca"}],"pageUserGroups":[{}],"title":{"en":"Stocktake Sessions - Shopify Inventory & BOM Manager"},"meta":{"desc":{"en":"List of stocktake sessions with filters and new session creation"},"keywords":{"en":"stocktake, inventory, sessions"},"socialDesc":{"en":"Manage stocktake sessions and create new ones"},"socialTitle":{"en":"Stocktake Sessions"}},"metaImage":""},{"id":"5c3b9fe3-35ea-4371-a2d0-4da7244dd5a6","linkId":"5c3b9fe3-35ea-4371-a2d0-4da7244dd5a6","name":"Orders","folder":"","paths":{"en":"orders","default":"orders"},"langs":["en"],"cmsDataSetPath":null,"sections":[{"uid":"e3b6f259-6a16-4235-acf5-40a49e150ebc","sectionTitle":"Sidebar Section","linkId":"579974dd-8b9f-465e-87d6-67a65899ba5d"},{"uid":"0ae0dbb2-24c3-4869-9a8b-f1124aba5b66","sectionTitle":"Orders Main Section","linkId":"3552a407-1ab4-436d-a6c7-42e226ba93e2"}],"pageUserGroups":[{}],"title":{"en":"Orders - Shopify Inventory & BOM Manager"},"meta":{"desc":{"en":"Orders list with status, filters, and search"},"keywords":{"en":"orders, Shopify, inventory, BOM"},"socialDesc":{"en":"Manage and view orders and their statuses"},"socialTitle":{"en":"Orders List"}},"metaImage":""}],"plugins":[{"id":"9c40819b-4a8f-468f-9ba5-4b9699f3361f","name":"Charts","namespace":"chartjs"},{"id":"832d6f7a-42c3-43f1-a3ce-9a678272f811","name":"Date","namespace":"dayjs"},{"id":"f5856798-485d-47be-b433-d43d771c64e1","name":"Xano Auth","namespace":"xanoAuth"},{"id":"2bd1c688-31c5-443e-ae25-59aa5b6431fb","name":"REST API","namespace":"restApi"},{"id":"cd33cf33-e29f-4e8c-ac26-b997fe507ce7","name":"Xano","namespace":"xano"}]};
// eslint-disable-next-line no-undef
window.wwg_cacheVersion = 8;
// eslint-disable-next-line no-undef
window.wwg_pluginsSettings = pluginsSettings;
// eslint-disable-next-line no-undef
window.wwg_disableManifest = false;

const defaultLang = window.wwg_designInfo.langs.find(({ default: isDefault }) => isDefault) || {};

const registerRoute = (page, lang, forcedPath) => {
    const langSlug = !lang.default || lang.isDefaultPath ? `/${lang.lang}` : '';
    let path =
        forcedPath ||
        (page.id === window.wwg_designInfo.homePageId ? '/' : `/${page.paths[lang.lang] || page.paths.default}`);

    //Replace params
    path = path.replace(/{{([\w]+)\|([^/]+)?}}/g, ':$1');

    routes.push({
        path: langSlug + path,
        component: wwPage,
        name: `page-${page.id}-${lang.lang}`,
        meta: {
            pageId: page.id,
            lang,
            isPrivate: !!page.pageUserGroups?.length,
        },
        async beforeEnter(to, from) {
            if (to.name === from.name) return;
            //Set page lang
            wwLib.wwLang.defaultLang = defaultLang.lang;
            wwLib.$store.dispatch('front/setLang', lang.lang);

            //Init plugins
            await initializePlugins();

            //Check if private page
            if (page.pageUserGroups?.length) {
                // cancel navigation if no plugin
                if (!wwLib.wwAuth.plugin) {
                    return false;
                }

                await wwLib.wwAuth.init();

                // Redirect to not sign in page if not logged
                if (!wwLib.wwAuth.getIsAuthenticated()) {
                    window.location.href = `${wwLib.wwPageHelper.getPagePath(
                        wwLib.wwAuth.getUnauthenticatedPageId()
                    )}?_source=${to.path}`;

                    return null;
                }

                //Check roles are required
                if (
                    page.pageUserGroups.length > 1 &&
                    !wwLib.wwAuth.matchUserGroups(page.pageUserGroups.map(({ userGroup }) => userGroup))
                ) {
                    window.location.href = `${wwLib.wwPageHelper.getPagePath(
                        wwLib.wwAuth.getUnauthorizedPageId()
                    )}?_source=${to.path}`;

                    return null;
                }
            }

            try {
                await import(`@/pages/${page.id.split('_')[0]}.js`);
                await wwLib.wwWebsiteData.fetchPage(page.id);

                //Scroll to section or on top after page change
                if (to.hash) {
                    const targetElement = document.getElementById(to.hash.replace('#', ''));
                    if (targetElement) targetElement.scrollIntoView();
                } else {
                    document.body.scrollTop = document.documentElement.scrollTop = 0;
                }

                return;
            } catch (err) {
                wwLib.$store.dispatch('front/showPageLoadProgress', false);

                if (err.redirectUrl) {
                    return { path: err.redirectUrl || '404' };
                } else {
                    //Any other error: go to target page using window.location
                    window.location = to.fullPath;
                }
            }
        },
    });
};

for (const page of window.wwg_designInfo.pages) {
    for (const lang of window.wwg_designInfo.langs) {
        if (!page.langs.includes(lang.lang)) continue;
        registerRoute(page, lang);
    }
}

const page404 = window.wwg_designInfo.pages.find(page => page.paths.default === '404');
if (page404) {
    for (const lang of window.wwg_designInfo.langs) {
        // Create routes /:lang/:pathMatch(.*)* etc for all langs of the 404 page
        if (!page404.langs.includes(lang.lang)) continue;
        registerRoute(
            page404,
            {
                default: false,
                lang: lang.lang,
            },
            '/:pathMatch(.*)*'
        );
    }
    // Create route /:pathMatch(.*)* using default project lang
    registerRoute(page404, { default: true, isDefaultPath: false, lang: defaultLang.lang }, '/:pathMatch(.*)*');
} else {
    routes.push({
        path: '/:pathMatch(.*)*',
        async beforeEnter() {
            window.location.href = '/404';
        },
    });
}

let routerOptions = {};

const isProd =
    !window.location.host.includes(
        // TODO: add staging2 ?
        '-staging.' + (process.env.WW_ENV === 'staging' ? import.meta.env.VITE_APP_PREVIEW_URL : '')
    ) && !window.location.host.includes(import.meta.env.VITE_APP_PREVIEW_URL);

if (isProd && window.wwg_designInfo.baseTag?.href) {
    let baseTag = window.wwg_designInfo.baseTag.href;
    if (!baseTag.startsWith('/')) {
        baseTag = '/' + baseTag;
    }
    if (!baseTag.endsWith('/')) {
        baseTag += '/';
    }

    routerOptions = {
        base: baseTag,
        history: createWebHistory(baseTag),
        routes,
    };
} else {
    routerOptions = {
        history: createWebHistory(),
        routes,
    };
}

router = createRouter({
    ...routerOptions,
    scrollBehavior,
});

//Trigger on page unload
let isFirstNavigation = true;
router.beforeEach(async (to, from) => {
    if (to.name === from.name) return;
    if (!isFirstNavigation) await onPageUnload();
    isFirstNavigation = false;
    wwLib.globalVariables._navigationId++;
    return;
});

//Init page
router.afterEach((to, from, failure) => {
    wwLib.$store.dispatch('front/showPageLoadProgress', false);
    let fromPath = from.path;
    let toPath = to.path;
    if (!fromPath.endsWith('/')) fromPath = fromPath + '/';
    if (!toPath.endsWith('/')) toPath = toPath + '/';
    if (failure || (from.name && toPath === fromPath)) return;
    initializeData(to);
});
/* wwFront:end */

export default router;
