insert into public.spot_photos (
  spot_id,
  url,
  created_at,
  uploaded_by
)
select
  sp.spot_id::uuid,
  sp.url,
  sp.created_at::timestamptz,
  nullif(sp.uploaded_by, '')::uuid
from jsonb_to_recordset('
[
 {
        "id": 1,
        "spot_id": "1101ee26-5046-4cdc-921a-5a3bd4cb5306",
        "url": "https://hjgcrrzfjchzqoegcywn.supabase.co/storage/v1/object/public/spot-photos/1101ee26-5046-4cdc-921a-5a3bd4cb5306/1759170969403-nh3iwestt3c.jpg",
        "created_at": "2025-09-29T18:36:10.121517+00:00",
        "uploaded_by": null
      },
      {
        "id": 2,
        "spot_id": "1101ee26-5046-4cdc-921a-5a3bd4cb5306",
        "url": "https://hjgcrrzfjchzqoegcywn.supabase.co/storage/v1/object/public/spot-photos/1101ee26-5046-4cdc-921a-5a3bd4cb5306/1759170970185-4zx1gj7mtyt.jpg",
        "created_at": "2025-09-29T18:36:10.658516+00:00",
        "uploaded_by": null
      },
      {
        "id": 6,
        "spot_id": "fe86af1e-c1dd-4655-a899-3de7ba3b0e1c",
        "url": "https://www.krafftbasel.ch/assets/01_Krafft-Basel/Bilder/Restaurant/Restaurant/DSCF0706__FocusFillWyItMC4xMSIsIjAuMDciLDI0OTYsMTIzMl0.jpg",
        "created_at": "2025-10-03T15:13:29.45755+00:00",
        "uploaded_by": null
      },
      {
        "id": 7,
        "spot_id": "fe86af1e-c1dd-4655-a899-3de7ba3b0e1c",
        "url": "https://www.krafftbasel.ch/assets/01_Krafft-Basel/Bilder/Restaurant/Restaurant/DSCF0706__FocusFillWyItMC4xMSIsIjAuMDciLDI0OTYsMTIzMl0.jpg",
        "created_at": "2025-10-03T15:17:08.361358+00:00",
        "uploaded_by": null
      },
      {
        "id": 10,
        "spot_id": "58fb0aab-ce95-40c4-99de-090e448145c5",
        "url": "https://hjgcrrzfjchzqoegcywn.supabase.co/storage/v1/object/public/spot-photos/spot_58fb0aab-ce95-40c4-99de-090e448145c5_1761764223470.jpg",
        "created_at": "2025-10-29T18:57:04.221113+00:00",
        "uploaded_by": null
      },
      {
        "id": 11,
        "spot_id": "d99b0a6a-b094-4f61-8573-250702a5fae8",
        "url": "https://hjgcrrzfjchzqoegcywn.supabase.co/storage/v1/object/public/spot-photos/spot_d99b0a6a-b094-4f61-8573-250702a5fae8_1761764938909.png",
        "created_at": "2025-10-29T19:08:59.975013+00:00",
        "uploaded_by": null
      },
      {
        "id": 12,
        "spot_id": "ff90b2f4-0c51-4423-adb5-e9a0ad22213e",
        "url": "https://hjgcrrzfjchzqoegcywn.supabase.co/storage/v1/object/public/spot-photos/spot_ff90b2f4-0c51-4423-adb5-e9a0ad22213e_1761985608832.jpg",
        "created_at": "2025-11-01T08:26:49.598612+00:00",
        "uploaded_by": null
      },
      {
        "id": 13,
        "spot_id": "55aac98e-4acf-4572-8710-945c7e8a6555",
        "url": "https://hjgcrrzfjchzqoegcywn.supabase.co/storage/v1/object/public/spot-photos/spot_55aac98e-4acf-4572-8710-945c7e8a6555_1762114428571.heic",
        "created_at": "2025-11-02T20:13:52.65484+00:00",
        "uploaded_by": null
      },
      {
        "id": 14,
        "spot_id": "7287f1cb-a7c6-4358-a1b3-34819069c6b6",
        "url": "https://hjgcrrzfjchzqoegcywn.supabase.co/storage/v1/object/public/spot-photos/spot_7287f1cb-a7c6-4358-a1b3-34819069c6b6_1762150526867.jpg",
        "created_at": "2025-11-03T06:15:28.093675+00:00",
        "uploaded_by": null
      },
      {
        "id": 15,
        "spot_id": "bf954886-b726-4544-b8c7-d67bc1cfecf7",
        "url": "https://hjgcrrzfjchzqoegcywn.supabase.co/storage/v1/object/public/spot-photos/spot_bf954886-b726-4544-b8c7-d67bc1cfecf7_1762175839646.jpg",
        "created_at": "2025-11-03T13:17:20.183762+00:00",
        "uploaded_by": null
      },
      {
        "id": 16,
        "spot_id": "5dd449f3-bd7f-40d4-8232-b7d0bb1daa3a",
        "url": "https://hjgcrrzfjchzqoegcywn.supabase.co/storage/v1/object/public/spot-photos/spot_5dd449f3-bd7f-40d4-8232-b7d0bb1daa3a_1762847176410.jpg",
        "created_at": "2025-11-11T07:46:17.114662+00:00",
        "uploaded_by": null
      },
      {
        "id": 17,
        "spot_id": "b76eb3ff-953b-4ae8-9e14-224ca49e1b8f",
        "url": "https://hjgcrrzfjchzqoegcywn.supabase.co/storage/v1/object/public/spot-photos/spot_b76eb3ff-953b-4ae8-9e14-224ca49e1b8f_1762851336366.jpg",
        "created_at": "2025-11-11T08:55:36.94489+00:00",
        "uploaded_by": null
      },
      {
        "id": 18,
        "spot_id": "01961cce-8d55-4e67-a25e-59bafa1122be",
        "url": "https://hjgcrrzfjchzqoegcywn.supabase.co/storage/v1/object/public/spot-photos/spot_01961cce-8d55-4e67-a25e-59bafa1122be_1762873845013.jpg",
        "created_at": "2025-11-11T15:10:46.504463+00:00",
        "uploaded_by": null
      },
      {
        "id": 19,
        "spot_id": "7b4dfb0a-49cb-4aa0-8430-3afbd37b5d31",
        "url": "https://hjgcrrzfjchzqoegcywn.supabase.co/storage/v1/object/public/spot-photos/spot_7b4dfb0a-49cb-4aa0-8430-3afbd37b5d31_1762875898472.jpg",
        "created_at": "2025-11-11T15:44:59.285098+00:00",
        "uploaded_by": null
      },
      {
        "id": 20,
        "spot_id": "0c1c741b-9b2c-4bea-aa31-faf184a4659a",
        "url": "https://hjgcrrzfjchzqoegcywn.supabase.co/storage/v1/object/public/spot-photos/spot_0c1c741b-9b2c-4bea-aa31-faf184a4659a_1762876138894.jpg",
        "created_at": "2025-11-11T15:48:59.701063+00:00",
        "uploaded_by": null
      },
      {
        "id": 21,
        "spot_id": "a9178789-196f-4b13-8b96-0a94bb29fd10",
        "url": "https://hjgcrrzfjchzqoegcywn.supabase.co/storage/v1/object/public/spot-photos/spot_a9178789-196f-4b13-8b96-0a94bb29fd10_1762876374986.jpg",
        "created_at": "2025-11-11T15:52:56.057833+00:00",
        "uploaded_by": null
      },
      {
        "id": 22,
        "spot_id": "9e3e1c38-4e52-47d6-b24c-76d12386adf1",
        "url": "https://hjgcrrzfjchzqoegcywn.supabase.co/storage/v1/object/public/spot-photos/spot_9e3e1c38-4e52-47d6-b24c-76d12386adf1_1762876532205.jpg",
        "created_at": "2025-11-11T15:55:33.555442+00:00",
        "uploaded_by": null
      },
      {
        "id": 23,
        "spot_id": "9bcf0f45-0bbd-4988-ba99-2352f8fe483b",
        "url": "https://hjgcrrzfjchzqoegcywn.supabase.co/storage/v1/object/public/spot-photos/spot_9bcf0f45-0bbd-4988-ba99-2352f8fe483b_1762945937463.jpg",
        "created_at": "2025-11-12T11:12:18.853857+00:00",
        "uploaded_by": null
      },
      {
        "id": 24,
        "spot_id": "879350d7-d1d9-4e68-85aa-866f0fae96fa",
        "url": "https://hjgcrrzfjchzqoegcywn.supabase.co/storage/v1/object/public/spot-photos/spot_879350d7-d1d9-4e68-85aa-866f0fae96fa_1762946082307.jpg",
        "created_at": "2025-11-12T11:14:42.919011+00:00",
        "uploaded_by": null
      },
      {
        "id": 25,
        "spot_id": "df035fda-40ea-4e7b-bde5-992b5aa5a1c2",
        "url": "https://hjgcrrzfjchzqoegcywn.supabase.co/storage/v1/object/public/spot-photos/spot_df035fda-40ea-4e7b-bde5-992b5aa5a1c2_1762946199341.jpg",
        "created_at": "2025-11-12T11:16:39.943683+00:00",
        "uploaded_by": null
      },
      {
        "id": 26,
        "spot_id": "607c44e8-2080-48a8-a530-166634121008",
        "url": "https://hjgcrrzfjchzqoegcywn.supabase.co/storage/v1/object/public/spot-photos/spot_607c44e8-2080-48a8-a530-166634121008_1762971159447.webp",
        "created_at": "2025-11-12T18:12:40.089769+00:00",
        "uploaded_by": null
      },
      {
        "id": 27,
        "spot_id": "7c51a785-2fa9-4c18-90ab-d16ba303c29c",
        "url": "https://hjgcrrzfjchzqoegcywn.supabase.co/storage/v1/object/public/spot-photos/spot_7c51a785-2fa9-4c18-90ab-d16ba303c29c_1763032008192.jpg",
        "created_at": "2025-11-13T11:06:48.671979+00:00",
        "uploaded_by": null
      },
      {
        "id": 28,
        "spot_id": "999c8376-3c6a-4a02-aca1-d2f934861444",
        "url": "https://hjgcrrzfjchzqoegcywn.supabase.co/storage/v1/object/public/spot-photos/spot_999c8376-3c6a-4a02-aca1-d2f934861444_1763110946031.jpg",
        "created_at": "2025-11-14T09:02:27.729913+00:00",
        "uploaded_by": null
      },
      {
        "id": 29,
        "spot_id": "514bdf47-f9f5-4cfd-80b2-b8677bc8e3da",
        "url": "https://hjgcrrzfjchzqoegcywn.supabase.co/storage/v1/object/public/spot-photos/spot_514bdf47-f9f5-4cfd-80b2-b8677bc8e3da_1763111098164.jpg",
        "created_at": "2025-11-14T09:04:58.856889+00:00",
        "uploaded_by": null
      },
      {
        "id": 31,
        "spot_id": "05f2d74b-aefb-4bbc-8af1-3c4b8018c25e",
        "url": "https://hjgcrrzfjchzqoegcywn.supabase.co/storage/v1/object/public/spot-photos/spot_05f2d74b-aefb-4bbc-8af1-3c4b8018c25e_1763204364643.jpg",
        "created_at": "2025-11-15T10:59:25.162385+00:00",
        "uploaded_by": null
      },
      {
        "id": 32,
        "spot_id": "fd87a0f6-60a2-4541-b009-28385e6e49f6",
        "url": "https://hjgcrrzfjchzqoegcywn.supabase.co/storage/v1/object/public/spot-photos/spot_fd87a0f6-60a2-4541-b009-28385e6e49f6_1763204472693.jpg",
        "created_at": "2025-11-15T11:01:13.675858+00:00",
        "uploaded_by": null
      },
      {
        "id": 33,
        "spot_id": "2c839cac-3dcb-4085-ac77-53a22e137569",
        "url": "https://hjgcrrzfjchzqoegcywn.supabase.co/storage/v1/object/public/spot-photos/spot_2c839cac-3dcb-4085-ac77-53a22e137569_1763205135821.jpg",
        "created_at": "2025-11-15T11:12:17.11227+00:00",
        "uploaded_by": null
      },
      {
        "id": 34,
        "spot_id": "d46188c0-d44f-4270-ad84-c277ffe27a46",
        "url": "https://hjgcrrzfjchzqoegcywn.supabase.co/storage/v1/object/public/spot-photos/spot_d46188c0-d44f-4270-ad84-c277ffe27a46_1763267277026.jpg",
        "created_at": "2025-11-16T04:28:17.741886+00:00",
        "uploaded_by": null
      },
      {
        "id": 35,
        "spot_id": "1fcfd6c8-76f9-462c-a1ea-130cffe37b0c",
        "url": "https://hjgcrrzfjchzqoegcywn.supabase.co/storage/v1/object/public/spot-photos/spot_1fcfd6c8-76f9-462c-a1ea-130cffe37b0c_1763309664837.webp",
        "created_at": "2025-11-16T16:14:25.640798+00:00",
        "uploaded_by": null
      },
      {
        "id": 36,
        "spot_id": "29c92004-30b8-43bd-81ec-4efb370eeb58",
        "url": "https://hjgcrrzfjchzqoegcywn.supabase.co/storage/v1/object/public/spot-photos/spot_29c92004-30b8-43bd-81ec-4efb370eeb58_1763368284152.jpg",
        "created_at": "2025-11-17T08:31:25.077169+00:00",
        "uploaded_by": null
      },
      {
        "id": 37,
        "spot_id": "a7c8c907-970c-4c2d-b9b6-b6345aa65b5e",
        "url": "https://hjgcrrzfjchzqoegcywn.supabase.co/storage/v1/object/public/spot-photos/spot_a7c8c907-970c-4c2d-b9b6-b6345aa65b5e_1763368424121.jpg",
        "created_at": "2025-11-17T08:33:45.006345+00:00",
        "uploaded_by": null
      },
      {
        "id": 38,
        "spot_id": "882524d5-4d08-4a25-8691-ce142aee4fc2",
        "url": "https://hjgcrrzfjchzqoegcywn.supabase.co/storage/v1/object/public/spot-photos/spot_882524d5-4d08-4a25-8691-ce142aee4fc2_1763369049878.jpg",
        "created_at": "2025-11-17T08:44:10.886704+00:00",
        "uploaded_by": null
      },
      {
        "id": 39,
        "spot_id": "644fbd15-91f8-4ab7-8a4b-dbe06622d148",
        "url": "https://hjgcrrzfjchzqoegcywn.supabase.co/storage/v1/object/public/spot-photos/spot_644fbd15-91f8-4ab7-8a4b-dbe06622d148_1763387387921.webp",
        "created_at": "2025-11-17T13:49:48.58153+00:00",
        "uploaded_by": null
      },
      {
        "id": 40,
        "spot_id": "e46a8ed7-94dd-4389-ad37-3ceddbeca654",
        "url": "https://hjgcrrzfjchzqoegcywn.supabase.co/storage/v1/object/public/spot-photos/spot_e46a8ed7-94dd-4389-ad37-3ceddbeca654_1763387654077.jpg",
        "created_at": "2025-11-17T13:54:15.459574+00:00",
        "uploaded_by": null
      },
      {
        "id": 41,
        "spot_id": "af12fbf8-7205-40a5-b102-4dc849369dd3",
        "url": "https://hjgcrrzfjchzqoegcywn.supabase.co/storage/v1/object/public/spot-photos/spot_af12fbf8-7205-40a5-b102-4dc849369dd3_1763887738608.jpg",
        "created_at": "2025-11-23T08:48:59.310633+00:00",
        "uploaded_by": null
      },
      {
        "id": 42,
        "spot_id": "0da020ba-2ef3-4840-9c07-f2376774e14f",
        "url": "https://hjgcrrzfjchzqoegcywn.supabase.co/storage/v1/object/public/spot-photos/spot_0da020ba-2ef3-4840-9c07-f2376774e14f_1763887977068.jpg",
        "created_at": "2025-11-23T08:52:58.106561+00:00",
        "uploaded_by": null
      },
      {
        "id": 43,
        "spot_id": "f4f8ef09-e0ca-4177-8cbe-607f9a647055",
        "url": "https://hjgcrrzfjchzqoegcywn.supabase.co/storage/v1/object/public/spot-photos/spot_f4f8ef09-e0ca-4177-8cbe-607f9a647055_1763888197997.jpg",
        "created_at": "2025-11-23T08:56:39.248455+00:00",
        "uploaded_by": null
      },
      {
        "id": 44,
        "spot_id": "57cb213c-9472-40b6-80be-a810fd77b7c9",
        "url": "https://hjgcrrzfjchzqoegcywn.supabase.co/storage/v1/object/public/spot-photos/spot_57cb213c-9472-40b6-80be-a810fd77b7c9_1763888340102.jpg",
        "created_at": "2025-11-23T08:59:00.794426+00:00",
        "uploaded_by": null
      },
      {
        "id": 45,
        "spot_id": "ab4da026-0d47-4ea1-b626-5293106b4fc2",
        "url": "https://hjgcrrzfjchzqoegcywn.supabase.co/storage/v1/object/public/spot-photos/spot_ab4da026-0d47-4ea1-b626-5293106b4fc2_1763889657376.jpg",
        "created_at": "2025-11-23T09:20:58.313+00:00",
        "uploaded_by": null
      },
      {
        "id": 46,
        "spot_id": "308c3258-b8a1-4ad5-8579-8a75390125eb",
        "url": "https://hjgcrrzfjchzqoegcywn.supabase.co/storage/v1/object/public/spot-photos/spot_308c3258-b8a1-4ad5-8579-8a75390125eb_1763889801769.jpg",
        "created_at": "2025-11-23T09:23:22.939829+00:00",
        "uploaded_by": null
      },
      {
        "id": 47,
        "spot_id": "a2a12ea3-1a8b-4810-91db-3704a0c57ff6",
        "url": "https://hjgcrrzfjchzqoegcywn.supabase.co/storage/v1/object/public/spot-photos/spot_a2a12ea3-1a8b-4810-91db-3704a0c57ff6_1763892128056.jpg",
        "created_at": "2025-11-23T10:02:08.671483+00:00",
        "uploaded_by": null
      },
      {
        "id": 48,
        "spot_id": "b65eb28d-a0c8-4ef7-9297-a16d88b9e250",
        "url": "https://hjgcrrzfjchzqoegcywn.supabase.co/storage/v1/object/public/spot-photos/spot_b65eb28d-a0c8-4ef7-9297-a16d88b9e250_1763892587003.webp",
        "created_at": "2025-11-23T10:09:49.199735+00:00",
        "uploaded_by": null
      },
      {
        "id": 49,
        "spot_id": "9f144aba-3d6f-403c-bdc8-e4e74cda0766",
        "url": "https://hjgcrrzfjchzqoegcywn.supabase.co/storage/v1/object/public/spot-photos/spot_9f144aba-3d6f-403c-bdc8-e4e74cda0766_1763892704537.jpg",
        "created_at": "2025-11-23T10:11:48.054935+00:00",
        "uploaded_by": null
      },
      {
        "id": 50,
        "spot_id": "a939c73b-7c61-49ae-ae42-4ada8d0747e0",
        "url": "https://hjgcrrzfjchzqoegcywn.supabase.co/storage/v1/object/public/spot-photos/spot_a939c73b-7c61-49ae-ae42-4ada8d0747e0_1763892805780.jpg",
        "created_at": "2025-11-23T10:13:27.229277+00:00",
        "uploaded_by": null
      },
      {
        "id": 51,
        "spot_id": "e1ec19df-5213-4445-8f36-b3484f5fc221",
        "url": "https://hjgcrrzfjchzqoegcywn.supabase.co/storage/v1/object/public/spot-photos/spot_e1ec19df-5213-4445-8f36-b3484f5fc221_1763892881531.jpg",
        "created_at": "2025-11-23T10:14:42.657456+00:00",
        "uploaded_by": null
      },
      {
        "id": 52,
        "spot_id": "a054f361-3a6d-404d-8e12-373f810fc6fc",
        "url": "https://hjgcrrzfjchzqoegcywn.supabase.co/storage/v1/object/public/spot-photos/spot_a054f361-3a6d-404d-8e12-373f810fc6fc_1763892966132.jpg",
        "created_at": "2025-11-23T10:16:06.981077+00:00",
        "uploaded_by": null
      },
      {
        "id": 53,
        "spot_id": "0547adcd-98a4-45c7-838f-0d0d0a7e7d01",
        "url": "https://hjgcrrzfjchzqoegcywn.supabase.co/storage/v1/object/public/spot-photos/spot_0547adcd-98a4-45c7-838f-0d0d0a7e7d01_1763893140446.jpg",
        "created_at": "2025-11-23T10:19:01.670292+00:00",
        "uploaded_by": null
      },
      {
        "id": 54,
        "spot_id": "589db2ae-3918-493b-bb38-af12923068b9",
        "url": "https://hjgcrrzfjchzqoegcywn.supabase.co/storage/v1/object/public/spot-photos/spot_589db2ae-3918-493b-bb38-af12923068b9_1763893265666.jpg",
        "created_at": "2025-11-23T10:21:06.471049+00:00",
        "uploaded_by": null
      },
      {
        "id": 55,
        "spot_id": "578a3178-c49c-458c-a368-a3346e7a33e2",
        "url": "https://hjgcrrzfjchzqoegcywn.supabase.co/storage/v1/object/public/spot-photos/header-578a3178-c49c-458c-a368-a3346e7a33e2-1765127020246.jpeg",
        "created_at": "2025-12-07T17:14:11.758283+00:00",
        "uploaded_by": null
      },
      {
        "id": 57,
        "spot_id": "92741865-1bfe-4f79-a99b-9304b946d167",
        "url": "https://hjgcrrzfjchzqoegcywn.supabase.co/storage/v1/object/public/spot-photos/spot_92741865-1bfe-4f79-a99b-9304b946d167_1765872524127.jpg",
        "created_at": "2025-12-16T08:08:45.49999+00:00",
        "uploaded_by": null
      },
      {
        "id": 58,
        "spot_id": "962241f7-33d3-4a4d-91f4-c5859c72941b",
        "url": "https://hjgcrrzfjchzqoegcywn.supabase.co/storage/v1/object/public/spot-photos/spot_962241f7-33d3-4a4d-91f4-c5859c72941b_1766464502713.jpg",
        "created_at": "2025-12-23T04:35:03.70505+00:00",
        "uploaded_by": null
      },
      {
        "id": 59,
        "spot_id": "c489a008-f7e3-40b6-a0c2-4c74d47d3a32",
        "url": "https://hjgcrrzfjchzqoegcywn.supabase.co/storage/v1/object/public/spot-photos/spot_c489a008-f7e3-40b6-a0c2-4c74d47d3a32_1767086586728.jpg",
        "created_at": "2025-12-30T09:23:09.658767+00:00",
        "uploaded_by": null
      },
      {
        "id": 60,
        "spot_id": "941da8a2-97c0-442f-adfb-288ee14904de",
        "url": "https://hjgcrrzfjchzqoegcywn.supabase.co/storage/v1/object/public/spot-photos/spot_941da8a2-97c0-442f-adfb-288ee14904de_1767684358381.jpg",
        "created_at": "2026-01-06T07:25:59.038427+00:00",
        "uploaded_by": null
      },
      {
        "id": 61,
        "spot_id": "9afaa613-a268-4e20-a5f3-624c647c0b6f",
        "url": "https://hjgcrrzfjchzqoegcywn.supabase.co/storage/v1/object/public/spot-photos/spot_9afaa613-a268-4e20-a5f3-624c647c0b6f_1770189158026.webp",
        "created_at": "2026-02-04T07:12:39.895401+00:00",
        "uploaded_by": null
      },
      {
        "id": 62,
        "spot_id": "13affe38-b268-4109-8c66-a7469f9823b7",
        "url": "https://hjgcrrzfjchzqoegcywn.supabase.co/storage/v1/object/public/spot-photos/spot_13affe38-b268-4109-8c66-a7469f9823b7_1770842634958.jpg",
        "created_at": "2026-02-11T20:43:56.158797+00:00",
        "uploaded_by": null
      },
      {
        "id": 63,
        "spot_id": "13affe38-b268-4109-8c66-a7469f9823b7",
        "url": "https://hjgcrrzfjchzqoegcywn.supabase.co/storage/v1/object/public/spot-photos/gallery-13affe38-b268-4109-8c66-a7469f9823b7-1770933917494-h4sruakvwtr.jpg",
        "created_at": "2026-02-12T22:05:19.237291+00:00",
        "uploaded_by": null
      },
      {
        "id": 64,
        "spot_id": "75ba6852-8bea-4be7-90fa-5c3438cc3a51",
        "url": "https://hjgcrrzfjchzqoegcywn.supabase.co/storage/v1/object/public/spot-photos/gallery-75ba6852-8bea-4be7-90fa-5c3438cc3a51-1775978196652-nqkrub8p4yn.jpg",
        "created_at": "2026-04-12T07:16:38.251164+00:00",
        "uploaded_by": null
      }
]
') as sp(
  id text,
  spot_id text,
  url text,
  created_at text,
  uploaded_by text
);