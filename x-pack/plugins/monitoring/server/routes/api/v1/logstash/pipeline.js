/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import Joi from 'joi';
import { handleError } from '../../../../lib/errors';
import { getPipelineVersions } from '../../../../lib/logstash/get_pipeline_versions';
import { getPipeline } from '../../../../lib/logstash/get_pipeline';
import { getPipelineVertex } from '../../../../lib/logstash/get_pipeline_vertex';
import { prefixIndexPattern } from '../../../../lib/ccs_utils';

function getPipelineVersion(versions, pipelineHash) {
  return pipelineHash
    ? versions.find(({ hash }) => hash === pipelineHash)
    : versions[0];
}

/*
 * Logstash Pipeline route.
 */
export function logstashPipelineRoute(server) {
  /**
   * Logstash Pipeline Viewer request.
   *
   * This will fetch all data required to display a Logstash Pipeline Viewer page.
   *
   * The current details returned are:
   *
   * - Pipeline Metrics
   */
  server.route({
    method: 'POST',
    path: '/api/monitoring/v1/clusters/{clusterUuid}/logstash/pipeline/{pipelineId}/{pipelineHash?}',
    config: {
      validate: {
        params: Joi.object({
          clusterUuid: Joi.string().required(),
          pipelineId: Joi.string().required(),
          pipelineHash: Joi.string().optional()
        }),
        payload: Joi.object({
          ccs: Joi.string().optional(),
          detailVertexId: Joi.string().optional()
        })
      }
    },
    handler: async (req) => {
      const config = server.config();
      const ccs = req.payload.ccs;
      const clusterUuid = req.params.clusterUuid;
      const detailVertexId = req.payload.detailVertexId;
      const lsIndexPattern = prefixIndexPattern(config, 'xpack.monitoring.logstash.index_pattern', ccs);

      const pipelineId = req.params.pipelineId;
      // Optional params default to empty string, set to null to be more explicit.
      const pipelineHash = req.params.pipelineHash || null;

      // Figure out which version of the pipeline we want to show
      let versions;
      try {
        versions = await getPipelineVersions(req, config, lsIndexPattern, clusterUuid, pipelineId);
      } catch (err) {
        return handleError(err, req);
      }
      const version = getPipelineVersion(versions, pipelineHash);

      const promises = [ getPipeline(req, config, lsIndexPattern, clusterUuid, pipelineId, version) ];
      if (detailVertexId) {
        promises.push(getPipelineVertex(req, config, lsIndexPattern, clusterUuid, pipelineId, version, detailVertexId));
      }

      try {
        const [ pipeline, vertex ] = await Promise.all(promises);
        return {
          versions,
          pipeline,
          vertex
        };
      } catch (err) {
        return handleError(err, req);
      }
    }
  });
}
