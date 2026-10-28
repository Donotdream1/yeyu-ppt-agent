import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'test/ui',timeout:45000,workers:1,reporter:'line',use:{baseURL:process.env.UI_TEST_URL||'http://127.0.0.1:3211',headless:true,viewport:{width:1440,height:1050},trace:'retain-on-failure',screenshot:'only-on-failure'},outputDir:'test-output/ui-results'});
