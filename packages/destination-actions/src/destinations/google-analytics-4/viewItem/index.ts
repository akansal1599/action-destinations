import { ActionDefinition, IntegrationError } from '@segment/actions-core'
import {
  verifyCurrency,
  verifyParams,
  verifyUserProps,
  convertTimestamp,
  getMobileStreamParams,
  getWebStreamParams
} from '../ga4-functions'
import {
  formatUserProperties,
  user_properties,
  params,
  currency,
  user_id,
  client_id,
  value,
  items_single_products,
  engagement_time_msec,
  timestamp_micros,
  app_instance_id,
  data_stream_type
} from '../ga4-properties'
import { DataStreamType, ProductItem } from '../ga4-types'
import type { Settings } from '../generated-types'
import type { Payload } from './generated-types'

const action: ActionDefinition<Settings, Payload> = {
  title: 'View Item',
  description: 'Send event when a user views an item',
  defaultSubscription: 'type = "track" and event =  "Product Viewed"',
  fields: {
    data_stream_type: { ...data_stream_type },
    app_instance_id: { ...app_instance_id },
    client_id: { ...client_id },
    user_id: { ...user_id },
    timestamp_micros: { ...timestamp_micros },
    currency: { ...currency },
    value: { ...value },
    items: {
      ...items_single_products,
      required: true
    },
    user_properties: user_properties,
    engagement_time_msec: engagement_time_msec,
    params: params
  },
  perform: (request, { payload, features, settings }) => {
    const stream_params =
      payload.data_stream_type === DataStreamType.Mobile
        ? getMobileStreamParams(settings.apiSecret, settings.firebaseAppId, payload.app_instance_id)
        : getWebStreamParams(settings.apiSecret, settings.measurementId, payload.client_id)

    if (payload.currency) {
      verifyCurrency(payload.currency)
    }

    let googleItems: ProductItem[] = []

    if (payload.items) {
      googleItems = payload.items.map((product) => {
        if (product.item_name === undefined && product.item_id === undefined) {
          throw new IntegrationError(
            'One of product name or product id is required for product or impression data.',
            'Misconfigured required field',
            400
          )
        }

        if (product.currency) {
          verifyCurrency(product.currency)
        }

        return product as ProductItem
      })
    }

    if (features && features['actions-google-analytics-4-verify-params-feature']) {
      verifyParams(payload.params)
      verifyUserProps(payload.user_properties)
    }
    const request_object: { [key: string]: unknown } = {
      ...stream_params.identifier,
      user_id: payload.user_id,
      events: [
        {
          name: 'view_item',
          params: {
            currency: payload.currency,
            items: googleItems,
            value: payload.value,
            engagement_time_msec: payload.engagement_time_msec,
            ...payload.params
          }
        }
      ],
      ...formatUserProperties(payload.user_properties)
    }

    if (features && features['actions-google-analytics-4-add-timestamp']) {
      request_object.timestamp_micros = convertTimestamp(payload.timestamp_micros)
    }

    // Firebase App ID can contain colons(:) and they should not be encoded. Hence, interpolating search params to url string instead passing them as search_params
    return request(`https://www.google-analytics.com/mp/collect?${stream_params.search_params}`, {
      method: 'POST',
      json: request_object
    })
  }
}

export default action
