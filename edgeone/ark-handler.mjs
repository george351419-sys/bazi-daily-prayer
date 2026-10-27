import {handleArkCloud} from '../lib/ark-cloud.mjs';
export default function onRequest({request,env={}}){return handleArkCloud(request,{...process.env,...env});}
